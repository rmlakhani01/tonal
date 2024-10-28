/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/record', 'N/search'], function (record, search) {
  const beforeSubmit = (context) => {
    if (context.newRecord.type === record.Type.CUSTOMER_REFUND) {
      try {
        log.debug('EXECUTION', 'CUSTOMER REFUND')
        let currentRecord = context.newRecord
        let poNum
        let orderId = currentRecord.getValue({ fieldId: 'custbody3' })
        orderId.includes('/') === true
          ? (poNum = orderId.split('/')[0])
          : (poNum = orderId)

        if (poNum) {
          let result = getRelatedTransactions(poNum)
          log.debug('result - before submit', result)

          if (result) {
            let customerDeposit = result.filter(
              (res) => res.transactionType === 'CustDep',
            )

            if (customerDeposit && customerDeposit.length > 0) {
              let applyLineCount = currentRecord.getLineCount({
                sublistId: 'apply',
              })
              log.debug('applyLineCount', applyLineCount)
              let depositLineCount = currentRecord.getLineCount({
                sublistId: 'deposit',
              })
              log.debug('depositLineCount', depositLineCount)

              if (applyLineCount === 0 && depositLineCount === 1) {
                log.debug('pre-fulfillment - partial refund') // deposit line count = 1, apply line count = 0
              }

              if (applyLineCount > 0 && depositLineCount > 0) {
                log.debug('pre-fulfillment - full refund') // deposit line count >0, apply line count > 0
                let line = currentRecord.findSublistLineWithValue({
                  sublistId: 'deposit',
                  fieldId: 'doc',
                  value: customerDeposit[0].transactionId,
                })
                log.debug('line', line)

                let isApplied = currentRecord.getSublistValue({
                  sublistId: 'deposit',
                  fieldId: 'apply',
                  line: line,
                })
                log.debug('isApplied', isApplied)
                if (isApplied === false) {
                  currentRecord.setSublistValue({
                    sublistId: 'deposit',
                    fieldId: 'apply',
                    line: line,
                    value: true,
                  })
                }
              }
            }
          }
        }
      } catch (error) {
        log.debug('ERROR - Customer Refund - Before Submit', error)
      }
    }
  }

  const afterSubmit = (context) => {
    try {
      if (context.newRecord.type === record.Type.CUSTOMER_REFUND) {
        let currentRecord = context.newRecord
        let poNum, invoices, creditMemoId, creditMemoUpdate
        let orderId = currentRecord.getValue({ fieldId: 'custbody3' })
        orderId.includes('/') === true
          ? (poNum = orderId.split('/')[0])
          : (poNum = orderId)

        let result = getRelatedTransactions(poNum)
        log.debug('result - after submit', result)

        let creditMemos = result.filter(
          (transaction) => transaction.transactionType === 'CustCred',
        )
        if (creditMemos && creditMemos.length > 0) {
          creditMemoId = creditMemos[0].transactionId
        }

        log.debug('credit memo id', creditMemoId)

        invoices = result.filter(
          (transaction) => transaction.transactionType === 'CustInvc',
        )
        if (creditMemoId) {
          creditMemoUpdate = updateCreditMemo(creditMemoId, invoices)
        }

        if (creditMemoUpdate === false) return false

        let custRefund = record.load({
          type: record.Type.CUSTOMER_REFUND,
          id: currentRecord.id,
          isDynamic: false,
        })
        let lineCount = custRefund.getLineCount({
          sublistId: 'apply',
        })
        for (var i = 0; i < lineCount; i++) {
          custRefund.setSublistValue({
            sublistId: 'apply',
            fieldId: 'apply',
            line: i,
            value: false,
          })

          custRefund.setSublistValue({
            sublistId: 'apply',
            fieldId: 'apply',
            line: i,
            value: true,
          })

          custRefund.save()
        }
      }
    } catch (error) {
      log.debug('ERROR', error)
    }
  }

  const getRelatedTransactions = (poNum) => {
    const transactions = []
    if (poNum) {
      search
        .create({
          type: search.Type.TRANSACTION,
          filters: [
            ['mainline', 'is', 'T'],
            'AND',
            ['memo', 'isnotempty', ''],
            'AND',
            ['datecreated', 'onorafter', '01/05/2023 12:00 am'],
            'AND',
            [
              ['memo', 'contains', poNum],
              'OR',
              ['otherrefnum', 'equalto', poNum],
            ],
          ],
          columns: [
            { name: 'type' },
            { name: 'tranid' },
            { name: 'memo' },
            { name: 'internalid' },
            { name: 'amount' },
          ],
        })
        .run()
        .each((transaction) => {
          transactions.push({
            transactionType: transaction.getValue({ name: 'type' }),
            docNum: transaction.getValue({ name: 'tranid' }),
            transactionId: transaction.getValue({
              name: 'internalid',
            }),
            amount: transaction.getValue({ name: 'amount' }),
          })
          return true
        })

      return transactions
    }
  }

  const updateCreditMemo = (creditMemoId, invoices) => {
    try {
      let creditMemo = record.load({
        type: record.Type.CREDIT_MEMO,
        id: creditMemoId,
        isDynamic: false,
      })

      if (invoices && invoices.length <= 1) {
        creditMemo.setValue({ fieldId: 'location', value: 3 })
        let itemCount = creditMemo.getLineCount({ sublistId: 'item' })
        for (var i = 0; i < itemCount; i++) {
          let salesTaxAmt = creditMemo.getSublistValue({
            sublistId: 'item',
            fieldId: 'rate',
            line: i,
          })
          if (salesTaxAmt) {
            creditMemo.setSublistValue({
              sublistId: 'item',
              fieldId: 'amount',
              value: salesTaxAmt,
              line: i,
            })
          }
        }

        let applyCount = creditMemo.getLineCount({
          sublistId: 'apply',
        })
        for (var y = 0; y < applyCount; y++) {
          creditMemo.setSublistValue({
            sublistId: 'apply',
            fieldId: 'apply',
            line: y,
            value: false,
          })
          creditMemo.setSublistValue({
            sublistId: 'apply',
            fieldId: 'apply',
            line: y,
            value: true,
          })
        }
        creditMemo.save()
      }

      if (invoices && invoices.length > 1) return false
    } catch (error) {
      log.debug('ERROR UPDATING CREDIT MEMO', error)
    }
  }

  return {
    beforeSubmit: beforeSubmit,
    afterSubmit: afterSubmit,
  }
})
