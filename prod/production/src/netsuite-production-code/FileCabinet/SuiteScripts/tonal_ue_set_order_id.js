/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/record'], function (record) {
  function afterSubmit(context) {
    log.debug('RECORD TYPE', context.newRecord.type)
    // if (context.type === 'create') {
      const allowedTypes = [
        record.Type.CREDIT_MEMO,
        record.Type.CUSTOMER_REFUND,
        record.Type.CUSTOMER_DEPOSIT,
        record.Type.INVOICE,
        record.Type.ITEM_FULFILLMENT,
      ]

      if (allowedTypes.includes(context.newRecord.type)) {
        setOrderId(context.newRecord)
      }
    // }
  }

  const setOrderId = (currentRecord) => {
    try {
      let orderNumber = currentRecord.getValue({
        fieldId: 'custbody3',
      })
      let memo = currentRecord.getValue({ fieldId: 'memo' })

      const orderIdRegex = /\d{10}/
      const hasOrderId = orderIdRegex.test(memo)
      log.debug('Passed Order ID Regex?', hasOrderId)
      

      if (!orderNumber) {
        log.debug(
          'ERROR',
          'Transaction is missing WooCommerce Order ID',
        )
        return
      }

      if (hasOrderId === false) {
        const trans = record.load({
          type: currentRecord.type,
          id: currentRecord.id,
          isDynamic: false,
        })

        trans.setValue({
          fieldId: 'memo',
          value: `${memo} WooCommerce Order ID: ${orderNumber}`,
        })

        trans.save()
      } else {
        log.debug(
          `Current Transaction: ${currentRecord.type}`,
          `Has the order number. ID: ${currentRecord.id}`,
        )
      }
    } catch (error) {
      log.debug('ERROR: Setting Order ID', error)
    }
  }

  return {
    afterSubmit: afterSubmit,
  }
})
