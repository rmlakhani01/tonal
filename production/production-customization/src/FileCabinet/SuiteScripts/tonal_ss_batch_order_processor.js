// @ts-nocheck
/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */

define(['N/record', 'N/search'], function (record, search) {
  const execute = (context) => {
    const orders = []
    const testInput = ['5347186', '7053671', '8167980', '8296057', '8321873', '8352618', '8542042', '9083122', '10132904', '10322252', '11644383', '11869021', '11902020', '12441871', '12589819']
    const sf = buildSearchFilters(testInput)
    const sc = [{ name: 'internalid' }, { name: 'trandate' }]
    search
      .create({
        type: search.Type.TRANSACTION,
        filters: sf,
        columns: sc,
      })
      .run()
      .each((order) => {
        orders.push({
          soId: order.getValue({ name: 'internalid' }),
          trandate: order.getValue({ name: 'trandate' }),
        })
        return true
      })
    const uniqueOrders = [
      ...new Map(
        orders.map((order) => [order['soId'], order]),
      ).values(),
    ]
    log.debug('uniqueOrders', uniqueOrders)
    // const invoicedSalesOrders = invoiceSalesOrders(uniqueOrders)
    const results = closeSalesOrders(uniqueOrders)
    log.debug('results', results)
  }

  const buildSearchFilters = (input) => {
    const temp = [
      ['type', 'anyof', 'SalesOrd'],
      'AND',
      ['mainline', 'is', true],
      'AND',
      // ['status', 'anyof', ['SalesOrd:B', 'SalesOrd:D', 'SalesOrd:E']],
      // 'AND',
    ]

    input.forEach((id) => {
      temp.push(['internalidnumber', 'equalto', id])
      temp.push('OR')
    })
    //removes the last "OR" statement
    temp.pop()

    return temp
  }

  const invoiceSalesOrders = (orders) => {
    log.debug('orders', orders)
    const processedOrders = []
    const ordersWithErrors = []
    try {
      orders.forEach((order) => {
        const invRec = record.transform({
          fromType: record.Type.SALES_ORDER,
          fromId: order.soId,
          toType: record.Type.INVOICE,
          isDynamic: true,
        })

        invRec.setValue({
          fieldId: 'trandate',
          value: new Date(order.trandate),
        })

        const lineCount = invRec.getLineCount({ sublistId: 'item' })
        if (lineCount > 0) {
          for (var i = 0; i < lineCount; i++) {
            invRec.selectLine({ sublistId: 'item', line: i })
            var backordered = invRec.getCurrentSublistValue({
              sublistId: 'item',
              fieldId: 'quantityremaining',
            })
            invRec.setCurrentSublistValue({
              sublistId: 'item',
              fieldId: 'quantity',
              value: backordered,
            })
            invRec.commitLine({ sublistId: 'item' })
          }

          const invId = invRec.save()
          log.debug(
            'Invoice ID: ' + invId,
            'Sales Order Id: ' + order.soId,
          )
          if (invId) {
            processedOrders.push({
              soId: order.soId,
              invId: invId,
              isInvoiced: true,
            })
          }
        }
      })
    } catch (error) {
      ordersWithErrors.push(error)
    }

    return [processedOrders, ordersWithErrors]
  }

  const closeSalesOrders = (orders) => {
    const results = []
    orders.forEach((order) => {
      const salesOrder = record.load({
        type: record.Type.SALES_ORDER,
        id: order.soId,
        isDynamic: true,
      })

      const lineCount = salesOrder.getLineCount({ sublistId: 'item' })
      for (var i = 0; i < lineCount; i++) {
        salesOrder.selectLine({ sublistId: 'item', line: i })
        salesOrder.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'isclosed',
          value: true,
        })

        salesOrder.commitLine({ sublistId: 'item' })
      }

      const closedSalesOrderId = salesOrder.save()
      if (closedSalesOrderId) {
        results.push({
          isSalesOrderClosed: true,
          soId: closedSalesOrderId,
          isInvoiced: true,
          // invId: order.invId,
        })
      }
    })

    return results
  }

  return {
    execute: execute,
  }
})
