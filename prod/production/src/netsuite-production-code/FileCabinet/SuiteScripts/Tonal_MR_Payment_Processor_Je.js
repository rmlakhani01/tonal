/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
* File Header
* Script Type: Map Reduce
* Script Name: Tonal MR Payment Processor Je
* File Name  : Tonal_MR_Payment_Processor_Je.js
* Created On : 03/05/2024
* Modified On: 
* Created By : 
* Modified By: 
* Description: This is used for create JE for CD, fro the payment processor
************************************************************/
let search,record,runtime,libRetry;
define(["N/search","N/record","N/runtime","./lib_retry_mechanism"], main);
function main(searchModule,recordModule,runtimeModule,libRetryMechnismModule) {
    try {
        search = searchModule;
        record = recordModule;
        runtime = runtimeModule;
        libRetry = libRetryMechnismModule
        return {
            getInputData: getInputData,
            map: map,
            /* reduce: reduce,
            summarize: summarize */
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

const getInputData = () => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let PROCESSING_AFFIRM_FEE = scriptObj.getParameter('custscript_p_affirmacc');//1019
        let DEFERRED_AFFIRM_FEE = scriptObj.getParameter('custscript_d_affirmacc');//1074
        let PROCESSING_STRIPE_FEE = scriptObj.getParameter('custscript_p_stripefeeacc');//252
        let DEFERRED_STRIPE_FEE = scriptObj.getParameter('custscript_d_stripefeeacc');//943
        let ssId = scriptObj.getParameter('custscript_data_ssid');
        if(!ssId || !PROCESSING_AFFIRM_FEE || !DEFERRED_AFFIRM_FEE || !PROCESSING_STRIPE_FEE || !DEFERRED_STRIPE_FEE){
            log.dbeuug('NO_ACTION','PARAMETERS_MISSING=='+JSON.stringify({ssId:ssId,PROCESSING_AFFIRM_FEE:PROCESSING_AFFIRM_FEE,DEFERRED_AFFIRM_FEE:DEFERRED_AFFIRM_FEE,PROCESSING_STRIPE_FEE:PROCESSING_STRIPE_FEE,DEFERRED_STRIPE_FEE:DEFERRED_STRIPE_FEE}));
            return [];
        }
        return search.load({
            id: ssId
        });
    } catch (error) {
       log.error('Error : In Get Input Stage',error);
       return []; 
    }
}

const map = (context) => {
    try {
        // log.debug('mapContext==',context);
        let scriptObj = runtime.getCurrentScript();
        let PROCESSING_AFFIRM_FEE = scriptObj.getParameter('custscript_p_affirmacc');//1019
        let DEFERRED_AFFIRM_FEE = scriptObj.getParameter('custscript_d_affirmacc');//1074
        let PROCESSING_STRIPE_FEE = scriptObj.getParameter('custscript_p_stripefeeacc');//252
        let DEFERRED_STRIPE_FEE = scriptObj.getParameter('custscript_d_stripefeeacc');//943
        let data = JSON.parse(context.value);
        let cdId = context.key;
        let order = fetchCustomerDeposits(cdId);
        if(order.length > 0){
            let orderObj = order[0]
            if (orderObj.paymentMethod === '8' || orderObj.paymentMethod === '11') {
                orderObj.debit = PROCESSING_STRIPE_FEE
                orderObj.credit = DEFERRED_STRIPE_FEE
            } else {
                orderObj.debit = PROCESSING_AFFIRM_FEE
                orderObj.credit = DEFERRED_AFFIRM_FEE
            }

            let ifData = getIfDetails(orderObj.salesOrderId);
            log.debug('ifData=='+ifData.length,ifData);
            if(ifData.length > 0){
                let recordObject = generateJournalEntry(orderObj,ifData[0].ifInternalId,ifData[0].ifDate);
                recordObject.isSuccess ? updateItemFulfillment(ifData[0].ifInternalId) : libRetry.updateTransaction(recordObject)
            }
            else{
                log.debug('NO_ACTION','IF_DATA_NOT_AVILABLE=='+ifData);
            }
        }
        else{
            log.debug('NO_ACTION','ORDERS_ARE_NOT_AVILABLE=='+order);
        }   
    } catch (error) {
       log.error('Error : In Map Stage',error);
       return []; 
    }
}

const reduce = (context) => {
    try {
        
    } catch (error) {
       log.error('Error : In Reduce Stage',error);
       return []; 
    }
}

const summarize = (summary) => {
    try {
        
    } catch (error) {
       log.error('Error : In Summarize Stage',error);
       return []; 
    } 
}

const fetchCustomerDeposits = (cdId) => {
    let orders = []
    let cdObj = record.load({
        type: record.Type.CUSTOMER_DEPOSIT,
        id: cdId,
        isDynamic: true,
    });
    orders.push({
        custDepId: cdId,
        fee: cdObj.getValue('custbody_payment_fee'),
        memo: cdObj.getValue('memo'),
        paymentMethod: cdObj.getValue('paymentmethod'),
        salesOrderId: cdObj.getValue('salesorder')
    });
    log.debug('orders', orders);
    return orders
}

const generateJournalEntry = (details, itemFulfilId, trandate) => {
    try {
        log.debug('details object', details)
        let recordObject = {}

        let journalRecord = record.create({
            type: record.Type.JOURNAL_ENTRY,
            isDynamic: true,
        });

        journalRecord.setValue({
            fieldId: 'externalid',
            value: 'OJE_' + details.memo,
        });

        journalRecord.setValue({ fieldId: 'approvalstatus', value: 2 });

        journalRecord.setValue({ fieldId: 'subsidiary', value: 1 });

        /* journalRecord.setValue({
            fieldId: 'trandate',
            value: new Date(trandate),
        }); */

        journalRecord.setText({
            fieldId: 'trandate',
            text: trandate,
        });

        journalRecord.setValue({ fieldId: 'memo', value: details.memo });

        journalRecord.insertLine({ sublistId: 'line', line: 0 });
        journalRecord.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: details.debit,
        });
        journalRecord.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'debit',
            value: details.fee,
        });
        journalRecord.commitLine({ sublistId: 'line' });
        journalRecord.insertLine({ sublistId: 'line', line: 1 });
        journalRecord.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: details.credit,
        });
        journalRecord.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'credit',
            value: details.fee,
        });
        journalRecord.commitLine({ sublistId: 'line' });

        let journalId = journalRecord.save()
        if (journalId) {
            recordObject.isSuccess = true;
            recordObject.sourceRecordType = record.Type.ITEM_FULFILLMENT;
            recordObject.sourceRecordId = itemFulfilId;
            recordObject.destinationRecordType = record.Type.JOURNAL_ENTRY;
            recordObject.destinationRecordId = journalId;

            record.submitFields({
                type: record.Type.CUSTOMER_DEPOSIT,
                id: details.custDepId,
                values: {
                    custbody_merchant_fee_je_2: journalId,
                },
            });
            log.debug('JE_CREATED_FOR_CD=='+details.custDepId,'JE_ID=='+journalId);
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
        log.debug('Error while generating Journal Entry:', recordObject)
        return recordObject
    }
}

const updateItemFulfillment = (ifId) => {
    let itemFulfil = record.load({
        type: record.Type.ITEM_FULFILLMENT,
        id: ifId,
    });

    itemFulfil.setValue({
        fieldId: 'custbody_processed_dt',
        value: new Date(),
    });

    itemFulfil.setValue({
        fieldId: 'custbody_error_description',
        value: '',
    }); 
    itemFulfil.setValue({
        fieldId: 'custbody_trigger_reprocess',
        value: false,
    });

    itemFulfil.save();
}

const getIfDetails = (soId) => {
    try {
        let itemfulfillmentSearchObj = search.create({
            type: "itemfulfillment",
            filters:
            [
               ["type","anyof","ItemShip"], 
               "AND", 
               ["createdfrom","anyof",soId], 
               "AND", 
               ["mainline","is","T"]
            ],
            columns:
            [
               search.createColumn({name: "createdfrom", label: "Created From"}),
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({
                  name: "tranid",
                  join: "createdFrom",
                  label: "Document Number"
               }),
               search.createColumn({name: "trandate", label: "Date"}),
            ]
        });
        var searchResultCount = itemfulfillmentSearchObj.runPaged().count;
        log.debug("IF Count",searchResultCount);
        let data = [];
        itemfulfillmentSearchObj.run().each(function(result){
            data.push({ifInternalId:result.id,createdFrom:result.getValue('createdfrom'),ifDate:result.getValue('trandate')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get IF Details',error);
        return [];
    }
}