/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */

define(['N/search', 'N/record', 'N/runtime', 'N/task'], function (
  search,
  record,
  runtime,
  task,
) {
  function execute(context) {
    const pendingOrders = getSalesOrders()
    try {
      log.debug('pending orders', pendingOrders)
      const forcedCloseDate = '06/30/2024'
      const uniqueOrders = [
        ...new Map(
          pendingOrders
            .filter((order) => order.id && order.trandate)
            .sort((a, b) => {
              // First, sort by 'id' in ascending order
              const idComparison = a.id.localeCompare(b.id)
              if (idComparison !== 0) {
                return idComparison
              }

              // If 'id' is the same, then sort by 'fulfillDate' in ascending order
              return a.fulfillDate.localeCompare(b.fulfillDate)
            })
            .map((order) => [order['id'], order]),
        ).values(),
      ]

      log.debug('unique Orders', uniqueOrders)

      for (const [index, order] of uniqueOrders.entries()) {
        try {
          log.debug('Order ID to be processed: ', order)
          const invoiceRecord = record.transform({
            fromType: record.Type.SALES_ORDER,
            fromId: order.id,
            toType: record.Type.INVOICE,
            isDynamic: true,
          })

          invoiceRecord.setValue({
            fieldId: 'trandate',
            value: new Date(forcedCloseDate),
          })

          //   if (order.trandate && order.fulfillDate === '') {
          //     invoiceRecord.setValue({
          //       fieldId: 'trandate',
          //       value: new Date(order.trandate),
          //     })
          //   } else if (order.trandate && order.fulfillDate !== '') {
          //     invoiceRecord.setValue({
          //       fieldId: 'trandate',
          //       value: new Date(order.fulfillDate),
          //     })
          //   }
          let invoiceId = invoiceRecord.save()
          if (invoiceId) {
            log.debug(
              'Invoice Created For Sales Order =>' + order.id,
              'Invoice Id =>' + invoiceId,
            )
            closeSalesOrderLines(order.id)
          }

          if (runtime.getCurrentScript().getRemainingUsage() < 1000) {
            let rescheduledTask = task.create({
              taskType: task.TaskType.SCHEDULED_SCRIPT,
              scriptId: runtime.getCurrentScript().id,
              deploymentId: runtime.getCurrentScript().deploymentId,
            })

            let rescheduledTaskId = rescheduledTask.submit()
            let rescheduledTaskStatus = task.checkStatus({
              taskId: rescheduledTaskId,
            })
            if (rescheduledTaskStatus === 'QUEUED') break
          }
        } catch (err) {
          //   populateErrors(err, order)
          log.debug('Error processing orders', err.message)
        }
      }
    } catch (e) {
      log.debug('Error processing orders', e.message)
      log.debug('Error processing orders', e.stack)
    }
  }

  const getSalesOrders = () => {
    const soids = [
      '7492166'
    ]
    let pendingOrders = []
    var sf = [
      ['type', 'anyof', 'SalesOrd'],
      'AND',
      ['status', 'anyof', ['SalesOrd:F','SalesOrd:B']],
      'AND',
      [
        'item.type',
        'anyof',
        'Assembly',
        'InvtPart',
        'Group',
        'Kit',
        'Service',
      ],
      'AND',
    ]

    soids.forEach((id) => {
      sf.push(['internalidnumber', 'equalto', id])
      sf.push('OR')
    })
    sf.pop()

    var sc = [
      { name: 'internalid' },
      { name: 'trandate' },
      { name: 'trandate', join: 'fulfillingTransaction' },
    ]

    search
      .create({
        type: search.Type.TRANSACTION,
        filters: sf,
        columns: sc,
      })
      .run()
      .each((result) => {
        pendingOrders.push({
          id: result.id,
          trandate: result.getValue({ name: 'trandate' }),
          fulfillDate: result.getValue({
            name: 'trandate',
            join: 'fulfillingTransaction',
          }),
        })
        return true
      })

    return pendingOrders
  }

  const closeSalesOrderLines = (id) => {
    try {
      const salesOrder = record.load({
        type: record.Type.SALES_ORDER,
        id: id,
        isDynamic: true,
      })

      let numberOfLines = salesOrder.getLineCount({
        sublistId: 'item',
      })
      for (let i = 0; i < numberOfLines; i++) {
        salesOrder.selectLine({ sublistId: 'item', line: i })
        salesOrder.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'isclosed',
          value: true,
        })
        salesOrder.commitLine({ sublistId: 'item', line: i })
      }
      salesOrder.save()
    } catch (error) {
      log.debug('ERROR OCCURRED WHILE CLOSING LINES', error)
    }
  }

  return {
    execute: execute,
  }
})
