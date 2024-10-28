/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime'], function (
  search,
  record,
  runtime,
) {
  const afterSubmit = (context) => {
    try {
      const STRIPE_DEBIT_ACCOUNT = 943
      const STRIPE_CREDIT_ACCOUNT = 1020
      const STRIPE_REFUND_DEBIT_ACCOUNT = 1020
      const STRIPE_REFUND_CREDIT_ACCOUNT = 252
      const depositRecord = context.newRecord
      const tranDate = depositRecord.getValue({
        fieldId: 'trandate',
      })
      // const memo = depositRecord.getValue({ fieldId: 'memo' })

      const payments = extractPaymentDetails(depositRecord)
      log.debug('payments', payments)

      const transactionTypes = paymentTypes(payments)
      const paymentTotals = computePaymentTotals(payments, transactionTypes)

      const cashBackPayments = extractCashBackDetails(depositRecord)
      const cashBackTotals = computeCashbackTotals(cashBackPayments)

      let customerDeposits = paymentTotals.filter(
        (payment) => payment.type === 'CustDep',
      )

      let customerRefunds = paymentTotals.filter(
        (payment) => payment.type === 'CustRfnd',
      )

      if (customerRefunds && customerRefunds.length > 0) {
        const custRefunds = customerRefunds[0].details
        const orderIdRegex = /\d{10}/
        let hardwareOrders = custRefunds.filter((refund) =>
          orderIdRegex.test(refund.memo),
        )

        hardwareOrders.forEach((refund) => {
          generateStripeJE(
            refund,
            record.Type.CUSTOMER_REFUND,
            tranDate,
            refund.memo,
            STRIPE_REFUND_DEBIT_ACCOUNT,
            STRIPE_REFUND_CREDIT_ACCOUNT,
          )
        })
      }

      if (customerDeposits && customerDeposits.length > 0) {
        const deposits = customerDeposits[0].details
        deposits.forEach((deposit) => {
          if (deposit.paymentMethod === '11') {
            generateStripeJE(
              deposit,
              record.Type.CUSTOMER_DEPOSIT,
              tranDate,
              deposit.memo,
              STRIPE_DEBIT_ACCOUNT,
              STRIPE_CREDIT_ACCOUNT,
            )
          }
        })
      }

      log.debug('Customer Deposits', customerDeposits)
      log.debug('Customer Refunds', customerRefunds)
      log.debug('Cash Back Totals', cashBackTotals)
    } catch (error) {
      log.debug('ERROR', error)
    }
  }

  const extractPaymentDetails = (depositRecord) => {
    try {
      log.debug('depositRecord', depositRecord)
      const payments = []

      let depositRec = record.load({
        type: record.Type.DEPOSIT,
        id: depositRecord.id,
        isDynamic: true,
      })

      let lineCount = depositRec.getLineCount({
        sublistId: 'payment',
      })
      for (var i = 0; i < lineCount; i += 1) {
        let isApplied = depositRec.getSublistValue({
          sublistId: 'payment',
          fieldId: 'deposit',
          line: i,
        })

        if (isApplied === true) {
          let payment = {
            line: i,
            type: depositRec.getSublistValue({
              sublistId: 'payment',
              fieldId: 'type',
              line: i,
            }),
            amount: parseFloat(
              depositRec.getSublistValue({
                sublistId: 'payment',
                fieldId: 'paymentamount',
                line: i,
              }),
            ),
            id: depositRec.getSublistValue({
              sublistId: 'payment',
              fieldId: 'id',
              line: i,
            }),
            memo: depositRec.getSublistValue({
              sublistId: 'payment',
              fieldId: 'memo',
              line: i,
            }),
            paymentMethod: depositRec.getSublistValue({
              sublistId: 'payment',
              fieldId: 'paymentmethod',
              line: i,
            }),
          }
          payments.push(payment)
        }
      }

      return payments
    } catch (error) {
      log.debug('ERROR', error)
    }
  }

  const extractCashBackDetails = (depositRecord) => {
    const payments = []

    const depositRec = record.load({
      type: record.Type.DEPOSIT,
      id: depositRecord.id,
      isDynamic: true,
    })

    const lineCount = depositRec.getLineCount({
      sublistId: 'cashback',
    })
    for (let i = 0; i < lineCount; i++) {
      payments.push({
        line: depositRec.getSublistValue({
          sublistId: 'cashback',
          fieldId: 'line',
          line: i,
        }),
        amount: depositRec.getSublistValue({
          sublistId: 'cashback',
          fieldId: 'amount',
          line: i,
        }),
      })
    }

    return payments
  }

  const paymentTypes = (payments) => {
    const transactionTypes = []

    // grabbing unique payments types
    const types = new Set()
    for (const payment of payments) {
      types.add(payment.type)
    }

    // extracting payment types
    types.forEach((type) => transactionTypes.push(type))

    return transactionTypes
  }

  const computePaymentTotals = (payments, transactionTypes) => {
    const STRIPE_FEE_PERCENTAGE = parseFloat(
      runtime
        .getCurrentScript()
        .getParameter({ name: 'custscript_stripe_percentage' }),
    )
    const amounts = []
    for (var i = 0; i < transactionTypes.length; i++) {
      amounts.push({
        type: transactionTypes[i],
        numberOfRecords: payments.filter(
          (deposits) => deposits.type === transactionTypes[i],
        ).length,
        amount: payments
          .filter((deposits) => deposits.type === transactionTypes[i])
          .reduce((acc, deposit) => acc + deposit.amount, 0),
        details: payments.filter(
          (deposits) => deposits.type === transactionTypes[i],
        ),
        feeAmount: calculateStripeFee(payments, STRIPE_FEE_PERCENTAGE),
      })
    }

    return amounts
  }

  const calculateStripeFee = (payments, stripePercentage) => {
    for (var value of payments) {
      value.fee = value.amount * stripePercentage
    }
    log.debug('payments', payments)
  }

  const computeCashbackTotals = (cashBackPayments) => {
    return cashBackPayments.reduce((acc, cashback) => acc + cashback.amount, 0)
  }

  const generateStripeJE = (
    object,
    type,
    tranDate,
    memo,
    debitAccount,
    creditAccount,
  ) => {
    let journalRecord = record.create({
      type: record.Type.JOURNAL_ENTRY,
      isDynamic: true,
    })

    journalRecord.setValue({
      fieldId: 'trandate',
      value: tranDate,
    })

    journalRecord.setValue({ fieldId: 'approvalstatus', value: 2 })
    journalRecord.setValue({ fieldId: 'subsidiary', value: 1 })
    journalRecord.setValue({ fieldId: 'memo', value: memo })
    journalRecord.insertLine({ sublistId: 'line', line: 0 })
    journalRecord.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'account',
      value: debitAccount,
    })
    journalRecord.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'debit',
      value: object.fee,
    })
    journalRecord.commitLine({ sublistId: 'line' })
    journalRecord.insertLine({ sublistId: 'line', line: 1 })
    journalRecord.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'account',
      value: creditAccount,
    })
    journalRecord.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'credit',
      value: object.fee,
    })
    journalRecord.commitLine({ sublistId: 'line' })

    let journalId = journalRecord.save()
    if (journalId && type === record.Type.CUSTOMER_DEPOSIT)
      updateCustomerDeposit(journalId, object.id, object.fee)

    if (journalId && type === record.Type.CUSTOMER_REFUND)
      updateCustomerRefund(journalId, object.id)
  }

  const updateCustomerDeposit = (journalId, depositId, fee) => {
    let customerDeposit = record.load({
      type: record.Type.CUSTOMER_DEPOSIT,
      id: depositId,
    })
    customerDeposit.setValue({
      fieldId: 'custbody_payment_fee',
      value: fee,
    })
    customerDeposit.setValue({
      fieldId: 'custbody_merchant_fee_je_1',
      value: journalId,
    })
    customerDeposit.save()
    log.debug(
      'Customer Deposit ID: ' + depositId,
      'Has been updated with the first Journal Entry',
    )
  }

  const updateCustomerRefund = (journalId, refundId) => {
    let refund = record.load({
      type: record.Type.CUSTOMER_REFUND,
      id: refundId,
    })
    refund.setValue({
      fieldId: 'custbody_merchant_fee_je_1',
      value: journalId,
    })
    refund.save()
    log.debug(
      'Customer Refund ID: ' + refundId,
      'Has been updated with the first Journal Entry',
    )
  }

  return {
    afterSubmit: afterSubmit,
  }
})
