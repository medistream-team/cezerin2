import { ObjectID } from "mongodb"
import { db } from "../../lib/mongo"
import parse from "../../lib/parse"
import settings from "../../lib/settings"
import security from "../../lib/security"
import webhooks from "../../lib/webhooks"
import CustomerGroupsService from "./customerGroups"

class CustomersService {
  getFilter(params: any = {}) {
    // tag
    // gender
    // date_created_to
    // date_created_from
    // total_spent_to
    // total_spent_from
    // orders_count_to
    // orders_count_from

    const filter: any = {}
    const id = parse.getObjectIDIfValid(params.id)
    const group_id = parse.getObjectIDIfValid(params.group_id)

    if (id) {
      filter._id = new ObjectID(id)
    }

    if (group_id) {
      filter.group_id = group_id
    }

    if (params.email) {
      filter.email = params.email.toLowerCase()
    }

    if (params.search) {
      console.log("==>", params.search)
      filter.$or = [
        { email: new RegExp(params.search, "i") },
        { mobile: new RegExp(params.search, "i") },
        { "address.address1": new RegExp(params.search, "i") },
        { full_name: new RegExp(params.search, "i") },
        // { $regex: params.search },
        // { $text: { $search: params.search } },
      ]
    }
    console.log(filter)

    return filter
  }

  getCustomers(params: any = {}) {
    const filter = this.getFilter(params)
    const limit = parse.getNumberIfPositive(params.limit) || 1000
    const offset = parse.getNumberIfPositive(params.offset) || 0

    return Promise.all([
      CustomerGroupsService.getGroups(),
      db
        .collection("customers")
        .find(filter)
        .sort({ date_created: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      db.collection("customers").countDocuments(filter),
    ]).then(([customerGroups, customers, customersCount]) => {
      const items = customers.map(customer =>
        this.changeProperties(customer, customerGroups)
      )
      const result = {
        total_count: customersCount,
        has_more: offset + items.length < customersCount,
        data: items,
      }
      return result
    })
  }

  getSingleCustomer(id) {
    if (!ObjectID.isValid(id)) {
      return Promise.reject("Invalid identifier")
    }
    return this.getCustomers({ id }).then(items =>
      items.data.length > 0 ? items.data[0] : {}
    )
  }

  async addCustomer(data) {
    const customer = this.getValidDocumentForInsert(data)

    // is email unique
    if (customer.email && customer.email.length > 0) {
      const customerCount = await db
        .collection("customers")
        .count({ email: customer.email })
      if (customerCount > 0) {
        return Promise.reject("Customer email must be unique")
      }
    }

    const insertResponse = await db
      .collection("customers")
      .insertMany([customer])
    const newCustomerId = insertResponse.ops[0]._id.toString()
    const newCustomer = await this.getSingleCustomer(newCustomerId)
    await webhooks.trigger({
      event: webhooks.events.CUSTOMER_CREATED,
      payload: newCustomer,
    })
    return newCustomer
  }

  async updateCustomer(id, data) {
    if (!ObjectID.isValid(id)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(id)
    const customer = this.getValidDocumentForUpdate(id, data)

    if (customer instanceof Error) return

    // is email unique
    if (customer.email && customer.email.length > 0) {
      const customerCount = await db.collection("customers").count({
        _id: {
          $ne: customerObjectID,
        },
        email: customer.email,
      })

      if (customerCount > 0) {
        return Promise.reject("Customer email must be unique")
      }
    }

    await db.collection("customers").updateOne(
      {
        _id: customerObjectID,
      },
      {
        $set: customer,
      }
    )

    const updatedCustomer = await this.getSingleCustomer(id)
    await webhooks.trigger({
      event: webhooks.events.CUSTOMER_UPDATED,
      payload: updatedCustomer,
    })
    return updatedCustomer
  }

  updateCustomerStatistics(customerId, totalSpent, ordersCount) {
    if (!ObjectID.isValid(customerId)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(customerId)
    const customerData = {
      total_spent: totalSpent,
      orders_count: ordersCount,
    }

    return db
      .collection("customers")
      .updateOne({ _id: customerObjectID }, { $set: customerData })
  }

  async deleteCustomer(customerId) {
    if (!ObjectID.isValid(customerId)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(customerId)
    const customer = await this.getSingleCustomer(customerId)
    const deleteResponse = await db
      .collection("customers")
      .deleteOne({ _id: customerObjectID })
    await webhooks.trigger({
      event: webhooks.events.CUSTOMER_DELETED,
      payload: customer,
    })
    return deleteResponse.deletedCount > 0
  }

  getValidDocumentForInsert(data) {
    const customer = {
      date_created: new Date(),
      date_updated: null,
      total_spent: 0,
      orders_count: 0,
      note: parse.getString(data.note),
      email: parse.getString(data.email).toLowerCase(),
      mobile: parse.getString(data.mobile).toLowerCase(),
      full_name: parse.getString(data.full_name),
      first_name: parse.getString(data.first_name),
      last_name: parse.getString(data.last_name),
      password: parse.getString(data.password),
      gender: parse.getString(data.gender).toLowerCase(),
      group_id: parse.getObjectIDIfValid(data.group_id),
      tags: parse.getArrayIfValid(data.tags) || [],
      social_accounts: parse.getArrayIfValid(data.social_accounts) || [],
      birthdate: parse.getDateIfValid(data.birthdate),
      addresses: this.validateAddresses(data.addresses),
      browser: parse.getBrowser(data.browser),
    }

    return customer
  }

  validateAddresses(addresses) {
    if (addresses && addresses.length > 0) {
      const validAddresses = addresses.map(addressItem =>
        parse.getCustomerAddress(addressItem)
      )
      return validAddresses
    }
    return []
  }

  getValidDocumentForUpdate(id, data) {
    if (Object.keys(data).length === 0) {
      return new Error("Required fields are missing")
    }

    const customer: any = {
      date_updated: new Date(),
    }

    if (data.note !== undefined) {
      customer.note = parse.getString(data.note)
    }

    if (data.email !== undefined) {
      customer.email = parse.getString(data.email).toLowerCase()
    }

    if (data.mobile !== undefined) {
      customer.mobile = parse.getString(data.mobile).toLowerCase()
    }

    if (data.full_name !== undefined) {
      customer.full_name = parse.getString(data.full_name)
    }

    if (data.first_name !== undefined) {
      customer.first_name = parse.getString(data.first_name)
    }

    if (data.last_name !== undefined) {
      customer.last_name = parse.getString(data.last_name)
    }

    if (data.password !== undefined) {
      customer.password = parse.getString(data.password)
    }

    if (data.gender !== undefined) {
      customer.gender = parse.getString(data.gender)
    }

    if (data.group_id !== undefined) {
      customer.group_id = parse.getObjectIDIfValid(data.group_id)
    }

    if (data.tags !== undefined) {
      customer.tags = parse.getArrayIfValid(data.tags) || []
    }

    if (data.social_accounts !== undefined) {
      customer.social_accounts =
        parse.getArrayIfValid(data.social_accounts) || []
    }

    if (data.birthdate !== undefined) {
      customer.birthdate = parse.getDateIfValid(data.birthdate)
    }

    if (data.addresses !== undefined) {
      customer.addresses = this.validateAddresses(data.addresses)
    }

    if (data.browser !== undefined) {
      customer.browser = parse.getBrowser(data.browser)
    }

    return customer
  }

  changeProperties(customer, customerGroups) {
    if (customer) {
      customer.id = customer._id.toString()
      delete customer._id

      const customerGroup = customer.group_id
        ? customerGroups.find(
            group => group.id === customer.group_id.toString()
          )
        : null

      customer.group_name =
        customerGroup && customerGroup.name ? customerGroup.name : ""

      if (customer.addresses && customer.addresses.length === 1) {
        customer.billing = customer.shipping = customer.addresses[0]
      } else if (customer.addresses && customer.addresses.length > 1) {
        const default_billing = customer.addresses.find(
          address => address.default_billing
        )
        const default_shipping = customer.addresses.find(
          address => address.default_shipping
        )
        customer.billing = default_billing || customer.addresses[0]
        customer.shipping = default_shipping || customer.addresses[0]
      } else {
        customer.billing = {}
        customer.shipping = {}
      }
    }

    return customer
  }

  addAddress(customer_id, address) {
    if (!ObjectID.isValid(customer_id)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(customer_id)
    const validAddress = parse.getCustomerAddress(address)

    return db.collection("customers").updateOne(
      {
        _id: customerObjectID,
      },
      {
        $push: {
          addresses: validAddress,
        },
      }
    )
  }

  createObjectToUpdateAddressFields(address) {
    const fields = {}

    if (address.address1 !== undefined) {
      fields["addresses.$.address1"] = parse.getString(address.address1)
    }

    if (address.address2 !== undefined) {
      fields["addresses.$.address2"] = parse.getString(address.address2)
    }

    if (address.city !== undefined) {
      fields["addresses.$.city"] = parse.getString(address.city)
    }

    if (address.country !== undefined) {
      fields["addresses.$.country"] = parse
        .getString(address.country)
        .toUpperCase()
    }

    if (address.state !== undefined) {
      fields["addresses.$.state"] = parse.getString(address.state)
    }

    if (address.phone !== undefined) {
      fields["addresses.$.phone"] = parse.getString(address.phone)
    }

    if (address.postal_code !== undefined) {
      fields["addresses.$.postal_code"] = parse.getString(address.postal_code)
    }

    if (address.full_name !== undefined) {
      fields["addresses.$.full_name"] = parse.getString(address.full_name)
    }

    if (address.company !== undefined) {
      fields["addresses.$.company"] = parse.getString(address.company)
    }

    if (address.tax_number !== undefined) {
      fields["addresses.$.tax_number"] = parse.getString(address.tax_number)
    }

    if (address.coordinates !== undefined) {
      fields["addresses.$.coordinates"] = address.coordinates
    }

    if (address.details !== undefined) {
      fields["addresses.$.details"] = address.details
    }

    if (address.default_billing !== undefined) {
      fields["addresses.$.default_billing"] = parse.getBooleanIfValid(
        address.default_billing,
        false
      )
    }

    if (address.default_shipping !== undefined) {
      fields["addresses.$.default_shipping"] = parse.getBooleanIfValid(
        address.default_shipping,
        false
      )
    }

    return fields
  }

  updateAddress(customer_id, address_id, data) {
    if (!ObjectID.isValid(customer_id) || !ObjectID.isValid(address_id)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(customer_id)
    const addressObjectID = new ObjectID(address_id)
    const addressFields = this.createObjectToUpdateAddressFields(data)

    return db.collection("customers").updateOne(
      {
        _id: customerObjectID,
        "addresses.id": addressObjectID,
      },
      { $set: addressFields }
    )
  }

  deleteAddress(customer_id, address_id) {
    if (!ObjectID.isValid(customer_id) || !ObjectID.isValid(address_id)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(customer_id)
    const addressObjectID = new ObjectID(address_id)

    return db.collection("customers").updateOne(
      {
        _id: customerObjectID,
      },
      {
        $pull: {
          addresses: {
            id: addressObjectID,
          },
        },
      }
    )
  }

  setDefaultBilling(customer_id, address_id) {
    if (!ObjectID.isValid(customer_id) || !ObjectID.isValid(address_id)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(customer_id)
    const addressObjectID = new ObjectID(address_id)

    return db
      .collection("customers")
      .updateOne(
        {
          _id: customerObjectID,
          "addresses.default_billing": true,
        },
        {
          $set: {
            "addresses.$.default_billing": false,
          },
        }
      )
      .then(res =>
        db.collection("customers").updateOne(
          {
            _id: customerObjectID,
            "addresses.id": addressObjectID,
          },
          {
            $set: {
              "addresses.$.default_billing": true,
            },
          }
        )
      )
  }

  setDefaultShipping(customer_id, address_id) {
    if (!ObjectID.isValid(customer_id) || !ObjectID.isValid(address_id)) {
      return Promise.reject("Invalid identifier")
    }
    const customerObjectID = new ObjectID(customer_id)
    const addressObjectID = new ObjectID(address_id)

    return db
      .collection("customers")
      .updateOne(
        {
          _id: customerObjectID,
          "addresses.default_shipping": true,
        },
        {
          $set: {
            "addresses.$.default_shipping": false,
          },
        }
      )
      .then(res =>
        db.collection("customers").updateOne(
          {
            _id: customerObjectID,
            "addresses.id": addressObjectID,
          },
          {
            $set: {
              "addresses.$.default_shipping": true,
            },
          }
        )
      )
  }

  logout() {
    // remove user from local storage to log user out
    localStorage.removeItem("user")
  }

  getAll() {
    const requestOptions = {
      method: "GET",
      // headers: authHeader()
    }

    return fetch(`${settings.storeBaseUrl}/users`, requestOptions).then(
      this.handleResponse
    )
  }

  handleResponse(response) {
    return response.text().then(text => {
      const data = text && JSON.parse(text)
      if (!response.ok) {
        if (response.status === 401) {
          // auto logout if 401 response returned from api
          this.logout()
          location.reload(true)
        }

        const error = (data && data.message) || response.statusText
        return Promise.reject(error)
      }

      return data
    })
  }
}

export default new CustomersService()
