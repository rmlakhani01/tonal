/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
define(['N/search', 'N/record'], function (search, record) {
  function execute(context) {
    let refunds = []
    search
      .create({
        type: search.Type.TRANSACTION,
        filters: [
          {
            name: 'type',
            operator: search.Operator.ANYOF,
            values: ['CustRfnd'],
          },
          {
            name: 'custbody_ready_for_processing',
            operator: search.Operator.IS,
            values: true,
          },
          {
            name: 'mainline',
            operator: search.Operator.IS,
            values: true,
          },
          {
            name: 'custbody_refund_processed',
            operator: search.Operator.IS,
            values: false,
          },
        ],
        columns: [{ name: 'internalid' }],
      })
      .run()
      .each((refund) => {
        refunds.push({ id: refund.getValue({ name: 'internalid' }) })
        return true
      })

    log.debug('refunds', refunds)

    refunds.forEach((refund) => {
      log.debug('refund id', refund.id)
      let originalAmount, refundAmount, doc
      let customerRefund = record.load({
        type: record.Type.CUSTOMER_REFUND,
        id: refund.id,
        isDynamic: false,
      })

      let sublists = customerRefund.getSublists()
      log.debug('sublists', sublists)

      let lineCount = customerRefund.getLineCount({
        sublistId: 'apply',
      })
      log.debug('line count', lineCount)

      if (lineCount > 0) {
        for (let i = 0; i < lineCount; i++) {
          let transType = customerRefund.getSublistValue({
            sublistId: 'apply',
            fieldId: 'type',
            line: i,
          })
          log.debug('transType', transType)
          if (transType === 'Deposit Application') {
            originalAmount = parseFloat(
              customerRefund.getSublistValue({
                sublistId: 'apply',
                fieldId: 'total',
                line: i,
              }),
            )

            refundAmount = customerRefund.getSublistValue({
              sublistId: 'apply',
              fieldId: 'due',
              line: i,
            })

            customerRefund.setSublistValue({
              sublistId: 'apply',
              fieldId: 'apply',
              line: i,
              value: true,
            })
          }
        }

        log.debug('original amount: ', originalAmount)
        log.debug('refund amount: ', refundAmount)

        customerRefund.setValue({
          fieldId: 'total',
          value: parseFloat(refundAmount),
        })
        customerRefund.setValue({
          fieldId: 'custbody_refund_processed',
          value: true,
        })
        let refundId = customerRefund.save()
        log.debug('refundId', refundId)
      }

      if (lineCount === 0) return false
    })
  }

  return {
    execute: execute,
  }
})
