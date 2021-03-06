import { ObjectID } from "mongodb"
import { db } from "../../lib/mongo"
import parse from "../../lib/parse"
import OrdersService from "./orders"

class OrdertDiscountsService {
  async addDiscount(order_id, data) {
    if (!ObjectID.isValid(order_id)) {
      return Promise.reject("Invalid identifier")
    }
    const orderObjectID = new ObjectID(order_id)
    const discount = this.getValidDocumentForInsert(data)

    await db.collection("orders").updateOne(
      {
        _id: orderObjectID,
      },
      {
        $push: {
          discounts: discount,
        },
      }
    )

    return discount
  }

  updateDiscount(order_id, discount_id, data) {
    if (!ObjectID.isValid(order_id) || !ObjectID.isValid(discount_id)) {
      return Promise.reject("Invalid identifier")
    }
    const orderObjectID = new ObjectID(order_id)
    const discountObjectID = new ObjectID(discount_id)
    const discount = this.getValidDocumentForUpdate(data)

    return db
      .collection("orders")
      .updateOne(
        {
          _id: orderObjectID,
          "discounts.id": discountObjectID,
        },
        { $set: discount }
      )
      .then(() => OrdersService.getSingleOrder(order_id))
  }

  deleteDiscount(order_id, discount_id) {
    if (!ObjectID.isValid(order_id) || !ObjectID.isValid(discount_id)) {
      return Promise.reject("Invalid identifier")
    }
    const orderObjectID = new ObjectID(order_id)
    const discountObjectID = new ObjectID(discount_id)

    return db
      .collection("orders")
      .updateOne(
        {
          _id: orderObjectID,
        },
        {
          $pull: {
            discounts: {
              id: discountObjectID,
            },
          },
        }
      )
      .then(() => OrdersService.getSingleOrder(order_id))
  }

  getValidDocumentForInsert(data) {
    return {
      id: new ObjectID(),
      name: parse.getString(data.name),
      amount: parse.getNumberIfPositive(data.amount) || 0,
    }
  }

  getValidDocumentForUpdate(data) {
    if (Object.keys(data).length === 0) {
      return new Error("Required fields are missing")
    }

    const discount = {}

    if (data.name !== undefined) {
      discount["discounts.$.name"] = parse.getString(data.name)
    }

    if (data.amount !== undefined) {
      discount["discounts.$.amount"] = parse.getNumberIfPositive(data.amount)
    }

    return discount
  }
}

export default new OrdertDiscountsService()
