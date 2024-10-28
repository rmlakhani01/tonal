/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define([
  'N/search',
  'N/record',
  'N/runtime',
  './lib_retry_mechanism',
], function (search, record, runtime, libRetry) {
  const afterSubmit = (context) => {
    const PROCESSING_AFFIRM_FEE = 1019
    const DEFERRED_AFFIRM_FEE = 1074

    if (context.type === 'create') {
      const currentRecord = context.newRecord

      const trandate = currentRecord.getValue({ fieldId: 'trandate' })
      const order = fetchCustomerDeposits(
        currentRecord.getValue({ fieldId: 'createdfrom' }),
      )
      if (order.length > 0) {
      let [orderObj] = order
      log.debug('orderObj', orderObj)

      if (orderObj.paymentMethod === '7') {
        orderObj.debit = PROCESSING_AFFIRM_FEE
        orderObj.credit = DEFERRED_AFFIRM_FEE

        log.debug('Payment Method - Affirm', orderObj)
        let recordObject = generateJournalEntry(
          orderObj,
          currentRecord.id,
          trandate,
        )

        if (recordObject) {
          recordObject.isSuccess
            ? updateItemFulfillment(context.newRecord)
            : libRetry.updateTransaction(recordObject)
        }
      }
      }
      
    }
  }

  const fetchCustomerDeposits = (soId) => {
    let orders = []
    search
      .create({
        type: search.Type.TRANSACTION,
        filters: [
          {
            name: 'type',
            operator: search.Operator.ANYOF,
            values: ['CustDep'],
          },
          {
            name: 'salesorder',
            operator: search.Operator.ANYOF,
            values: [soId],
          },
          {
            name: 'datecreated',
            join: 'createdfrom',
            operator: search.Operator.ONORAFTER,
            values: ['11/01/2022 12:00 am'],
          },
        ],
        columns: [
          { name: 'custbody_payment_fee' },
          { name: 'memo' },
          { name: 'internalid' },
          { name: 'paymentmethod' },
        ],
      })
      .run()
      .each((customerDeposit) => {
        orders.push({
          custDepId: customerDeposit.getValue({ name: 'internalid' }),
          fee: customerDeposit.getValue({
            name: 'custbody_payment_fee',
          }),
          memo: customerDeposit.getValue({ name: 'memo' }),
          paymentMethod: customerDeposit.getValue({
            name: 'paymentmethod',
          }),
        })
        return true
      })
    return orders
  }

  const generateJournalEntry = (details, itemFulfilId, trandate) => {
    try {
      let recordObject = {}

      let journalRecord = record.create({
        type: record.Type.JOURNAL_ENTRY,
        isDynamic: true,
      })

      journalRecord.setValue({
        fieldId: 'externalid',
        value: 'OJE_' + details.memo,
      })
      journalRecord.setValue({ fieldId: 'approvalstatus', value: 2 })
      journalRecord.setValue({ fieldId: 'subsidiary', value: 1 })
      journalRecord.setValue({
        fieldId: 'trandate',
        value: new Date(trandate),
      })
      journalRecord.setValue({ fieldId: 'memo', value: details.memo })
      journalRecord.insertLine({ sublistId: 'line', line: 0 })
      journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: details.debit,
      })
      journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'debit',
        value: details.fee,
      })
      journalRecord.commitLine({ sublistId: 'line' })
      journalRecord.insertLine({ sublistId: 'line', line: 1 })
      journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: details.credit,
      })
      journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'credit',
        value: details.fee,
      })
      journalRecord.commitLine({ sublistId: 'line' })

      let journalId = journalRecord.save()
      if (journalId) {
        recordObject.isSuccess = true
        recordObject.sourceRecordType = record.Type.ITEM_FULFILLMENT
        recordObject.sourceRecordId = itemFulfilId
        recordObject.destinationRecordType = record.Type.JOURNAL_ENTRY
        recordObject.destinationRecordId = journalId

        record.submitFields({
          type: record.Type.CUSTOMER_DEPOSIT,
          id: details.custDepId,
          values: {
            custbody_merchant_fee_je_2: journalId,
          },
        })

        return recordObject
      }
    } catch (e) {
      let recordObject = {
        isSuccess: false,
        errors: e,
        sourceRecordType: record.Type.ITEM_FULFILLMENT,
        sourceRecordId: itemFulfilId,
        destinationRecordType: record.Type.JOURNAL_ENTRY,
        destinationRecordId: null,
      }
      return recordObject
    }
  }

  const updateItemFulfillment = (newRecord) => {
    let itemFulfil = record.load({
      type: newRecord.type,
      id: newRecord.id,
    })

    itemFulfil.setValue({
      fieldId: 'custbody_processed_dt',
      value: new Date(),
    })

    itemFulfil.setValue({
      fieldId: 'custbody_error_description',
      value: '',
    })
    itemFulfil.setValue({
      fieldId: 'custbody_trigger_reprocess',
      value: false,
    })

    itemFulfil.save()
  }

  return {
    afterSubmit: afterSubmit,
  }
})
