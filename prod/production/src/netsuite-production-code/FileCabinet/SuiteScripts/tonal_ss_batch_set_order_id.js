/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
define(['N/record', 'N/search'], function (record, search) {
  function execute(context) {
    search
      .create({
        type: search.Type.TRANSACTION,
        filters: [
          {
            name: 'type',
            operator: search.Operator.ANYOF,
            values: ['DepAppl'],
          },
          {
            name: 'custbody3',
            operator: search.Operator.ISNOTEMPTY,
            values: [],
          },
          {
            name: 'memomain',
            operator: search.Operator.DOESNOTCONTAIN,
            values: ['WooCommerce'],
          },
          {
            name: 'mainline',
            operator: search.Operator.IS,
            values: true,
          },
          {
            name: 'datecreated',
            operator: search.Operator.AFTER,
            values: ['10/15/2023 11:59 pm'],
          },
          {
            name: 'custbody_processed_dt',
            operator: search.Operator.ISEMPTY,
          },
        ],
        columns: [
          { name: 'internalid' },
          { name: 'memo' },
          { name: 'custbody3' },
        ],
      })
      .run()
      .each((result) => {
        log.debug('result', result)
        let trans = record.load({
          type: record.Type.DEPOSIT_APPLICATION,
          id: result.id,
          isDynamic: false,
        })

        let memo = trans.getValue({ fieldId: 'memo' })

        const orderIdRegex = /\d{10}/
        const hasOrderId = orderIdRegex.test(memo)
        log.debug('Passed Order ID Regex?', hasOrderId)

        if (hasOrderId === false) {
          trans.setValue({
            fieldId: 'memo',
            value: `${result.getValue({
              name: 'memo',
            })} WooCommerce Order ID: ${result.getValue({
              name: 'custbody3',
            })}`,
          })

          trans.setValue({
            fieldId: 'custbody_processed_dt',
            value: new Date(),
          })

          trans.save()

        }
        return true
      })
  }

  return {
    execute: execute,
  }
})
