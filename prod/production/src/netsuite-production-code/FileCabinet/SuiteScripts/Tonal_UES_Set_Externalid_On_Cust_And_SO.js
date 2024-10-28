/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event Script
 * Script Name : Tonal UES Set Externalid On Cust And SO
 * File Name   : Tonal_UES_Set_Externalid_On_Cust_And_SO.js
 * Description : This script is used for set externalid on cuatomer and SO if context is UI. Jira ticket [ES-3203],[ES-3204].
 * Created On  : 06/12/2023
 * Modification Details:  
 ************************************************************/
let runtime,record;
define(["N/runtime","N/record"],main);

function main(runtimeModule,recordModule) {

    runtime = runtimeModule;
    record = recordModule;

    return {
        afterSubmit: setExternalIdOnCustomerAndSalesOrder,
    }
    
}

function setExternalIdOnCustomerAndSalesOrder(context) {
    try {
        let ct = context.type;
        log.debug('ct==',ct);
        let rtc = runtime.executionContext;
        log.debug('rtc==',rtc);
        log.debug('recordType - recordId',context.newRecord.type + ' - ' + context.newRecord.id);
        if((ct == 'create' || ct == 'edit') && rtc == 'USERINTERFACE'){
            let recObj = record.load({
                type: context.newRecord.type,
                id: context.newRecord.id,
                isDynamic: true
            });
            let recType = context.newRecord.type;
            let recId = context.newRecord.id
            log.debug('recType=='+recType,'recId=='+recId);
            let externalId = recObj.getValue('externalid');
            log.debug('externalId==',externalId);
            if(!externalId){
                if(recType == 'salesorder'){
                    let poNumber = recObj.getValue('otherrefnum');
                    log.debug('poNumber=='+poNumber);
                    if(poNumber){
                        recObj.setValue('externalid',poNumber);
                        let recID = recObj.save();
                        log.debug('ExternalId Updated For Sales Order==',recID);
                    }
                    else{
                        log.debug('NO_ACTION','PONUMBER_MISSING_ON_SALES_ORDER');
                    }
                }
                else if(recType == 'customer'){
                    let emailAddress = recObj.getValue('email');
                    if(emailAddress){
                        log.debug('emailAddress==',emailAddress);
                        recObj.setValue('externalid',emailAddress);
                        let recID = recObj.save();
                        log.debug('ExternalId Updated For Customer==',recID);
                    }
                    else{
                        log.debug('NO_ACTION','EMAIL_MISSING_ON_CUSTOMER');
                    }
                }
            }
            else{
                log.debug('NO_ACTION','EXTERNALID_AVILABLE_ON_RECORD');
            }
        }
        else{
            log.debug('NO_ACTION','CONTEXT_DIFFERENT=='+JSON.stringify({ct:ct,extecutionContext:rtc}));
        }
    } catch (error) {
        log.error('Error : In Set ExternalID On Customer And Sales',error);
    }
}