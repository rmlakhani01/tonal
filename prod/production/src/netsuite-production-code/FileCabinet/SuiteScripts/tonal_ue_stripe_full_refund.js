/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
// @ts-ignore
define(['N/record', 'N/search'], function (record, search) {
  function afterSubmit(context) {
    const currentRecord = context.newRecord
    let salesOrderTotal

    const orderId = currentRecord.getValue({ fieldId: 'otherrefnum' })
    if (orderId && orderId !== '') {
      const currentLines = getCurrentLines(currentRecord)
      log.debug('currentLines', currentLines)

      const transactions = getTransactions(orderId)

      const salesOrder = transactions.filter(
        (transaction) => transaction.type === 'SalesOrd',
      )

      if (salesOrder && salesOrder.length > 0) {
        const salesOrderLines = getSalesOrderLines(salesOrder[0].tranId)
        log.debug('salesOrderLines', salesOrderLines)
        if (salesOrderLines) {
          salesOrderTotal = salesOrderLines.reduce(
            (acc, soLines) => acc + soLines.amount,
            0,
          )
        }
        log.debug('sales order total', salesOrderTotal)

        const currentTotal = currentLines.reduce(
          (acc, cmLines) => acc + cmLines.amount,
          0,
        )
        log.debug('current lines total', currentTotal)

        const memos = transactions.filter(
          (transaction) => transaction.type === 'CustCred',
        )

        if (salesOrderTotal && currentTotal) {
          if (salesOrderTotal === currentTotal) {
            //@ts-nocheck
            log.debug('salesOrderLines', salesOrderLines)
            log.debug('memos', memos)
            updateCreditMemo(memos[0].tranId, salesOrderLines)
          }
        }
      }
    }
  }

  const getTransactions = (orderId) => {
    const tranDetails = []
    search
      .create({
        type: search.Type.TRANSACTION,
        filters: [
          {
            name: 'mainline',
            operator: search.Operator.IS,
            values: true,
          },
          {
            name: 'memo',
            operator: search.Operator.ISNOTEMPTY,
            values: [],
          },
          {
            name: 'datecreated',
            operator: search.Operator.ONORAFTER,
            values: ['01/05/2024 12:00 am'],
          },
          {
            name: 'otherrefnum',
            operator: search.Operator.EQUALTO,
            values: [orderId],
          },
          {
            name: 'type',
            operator: search.Operator.ANYOF,
            values: ['SalesOrd', 'CustCred'],
          },
        ],
        columns: [
          { name: 'type' },
          { name: 'tranid' },
          { name: 'otherrefnum' },
          { name: 'internalid' },
          { name: 'amount' },
        ],
      })
      .run()
      .each((trans) => {
        tranDetails.push({
          type: trans.getValue({ name: 'type' }),
          docNum: trans.getValue({ name: 'tranid' }),
          orderId: trans.getValue({ name: 'otherrefnum' }),
          tranId: trans.getValue({ name: 'internalid' }),
          tranAmount: trans.getValue({ name: 'amount' }),
        })
        return true
      })

    return tranDetails
  }

  const getSalesOrderLines = (soId) => {
    const salesOrderLines = []

    const salesOrder = record.load({
      type: 'salesorder',
      id: soId,
      isDynamic: false,
    })

    const discountItem = salesOrder.getValue({
      fieldId: 'discountitem',
    })
    if (discountItem) {
      salesOrderLines.push({
        item: discountItem,
        itemType: 'Discount',
        qty: 1,
        rate: salesOrder.getValue({ fieldId: 'discountrate' }),
        amount: salesOrder.getValue({ fieldId: 'discountrate' }),
      })
    }

    const status = salesOrder.getValue({ fieldId: 'status' })
    if (status !== 'Billed') return false

    const lineCount = salesOrder.getLineCount({ sublistId: 'item' })
    for (var i = 0; i < lineCount; i++) {
      salesOrderLines.push({
        item: salesOrder.getSublistValue({
          sublistId: 'item',
          fieldId: 'item',
          line: i,
        }),
        itemType: salesOrder.getSublistValue({
          sublistId: 'item',
          fieldId: 'itemtype',
          line: i,
        }),
        qty: salesOrder.getSublistValue({
          sublistId: 'item',
          fieldId: 'quantity',
          line: i,
        }),
        rate: salesOrder.getSublistValue({
          sublistId: 'item',
          fieldId: 'rate',
          line: i,
        }),
        amount: salesOrder.getSublistValue({
          sublistId: 'item',
          fieldId: 'amount',
          line: i,
        }),
      })
    }
    return salesOrderLines
  }

  const updateCreditMemo = (memoId, soLines) => {
    try {
      const creditMemo = record.load({
        type: record.Type.CREDIT_MEMO,
        id: memoId,
        isDynamic: true,
      })

      const lineCount = creditMemo.getLineCount({ sublistId: 'item' })
      for (var i = 0; i < lineCount; i++) {
        creditMemo.removeLine({
          sublistId: 'item',
          line: i,
          ignoreRecalc: true,
        })
      }
      const isProcessed = creditMemo.getValue({
        fieldId: 'custbody_refund_processed',
      })
      if (isProcessed === false) {
        soLines.forEach((soLine) => {
          if (soLine.itemType === 'Discount') {
            creditMemo.setValue({
              fieldId: 'discountitem',
              value: soLine.item,
            })
            creditMemo.setValue({
              fieldId: 'discountrate',
              value: soLine.rate,
            })
            return
          }
          creditMemo.selectNewLine({ sublistId: 'item' })
          creditMemo.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            value: soLine.item,
          })
          creditMemo.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: soLine.qty,
          })
          creditMemo.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'rate',
            value: soLine.rate,
          })
          creditMemo.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'amount',
            value: soLine.amount,
          })
          creditMemo.commitLine({ sublistId: 'item' })
        })
        creditMemo.setValue({
          fieldId: 'custbody_ready_for_processing',
          value: true,
        })
        creditMemo.setValue({
          fieldId: 'custbody_refund_processed',
          value: true,
        })
      }
      creditMemo.save()
    } catch (error) {
      // @ts-ignore
      log.debug('ERROR', error)
    }
  }

  const getCurrentLines = (currentRecord) => {
    const lines = []
    let numberOfLines = currentRecord.getLineCount({
      sublistId: 'item',
    })

    for (var i = 0; i < numberOfLines; i++) {
      lines.push({
        item: currentRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'item',
          line: i,
        }),
        amount: currentRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'amount',
          line: i,
        }),
      })
    }

    return lines
  }

  return {
    afterSubmit: afterSubmit,
  }
})
