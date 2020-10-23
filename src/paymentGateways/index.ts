import OrdersService from "../services/orders/orders"
import PaymentGatewaysService from "../services/settings/paymentGateways"
import SettingsService from "../services/settings/settings"
import LiqPay from "./LiqPay"
import PayPalCheckout from "./PayPalCheckout"
import StripeElements from "./StripeElements"

const getOptions = async orderId => {
  const [order, settings] = await Promise.all([
    OrdersService.getSingleOrder(orderId),
    SettingsService.getSettings(),
  ])

  if (order && order.payment_method_id) {
    const gatewaySettings = await PaymentGatewaysService.getGateway(
      order.payment_method_gateway
    )

    const options = {
      gateway: order.payment_method_gateway,
      gatewaySettings,
      order,
      amount: order.grand_total,
      currency: settings.currency_code,
    }

    return options
  }
}

const getPaymentFormSettings = async orderId => {
  const options = await getOptions(orderId)

  switch (options.gateway) {
    case "paypal-checkout":
      return PayPalCheckout.getPaymentFormSettings(options)
    case "liqpay":
      return LiqPay.getPaymentFormSettings(options)
    case "stripe-elements":
      return StripeElements.getPaymentFormSettings(options)
    default:
      return Promise.reject("Invalid gateway")
  }
}

const paymentNotification = (req, res, gateway) =>
  PaymentGatewaysService.getGateway(gateway).then(gatewaySettings => {
    const options = {
      gateway,
      gatewaySettings,
      req,
      res,
    }

    switch (gateway) {
      case "paypal-checkout":
        return PayPalCheckout.paymentNotification(options)
      case "liqpay":
        return LiqPay.paymentNotification(options)
      default:
        return Promise.reject("Invalid gateway")
    }
  })

const processOrderPayment = async order => {
  const orderAlreadyCharged = order.paid === true
  if (orderAlreadyCharged) {
    return true
  }

  const gateway = order.payment_method_gateway
  const gatewaySettings = await PaymentGatewaysService.getGateway(gateway)
  const settings = await SettingsService.getSettings()

  switch (gateway) {
    case "stripe-elements":
      return StripeElements.processOrderPayment({
        order,
        gatewaySettings,
        settings,
      })
    default:
      return Promise.reject("Invalid gateway")
  }
}

export default {
  getPaymentFormSettings,
  paymentNotification,
  processOrderPayment,
}