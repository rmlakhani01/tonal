/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Merchant Fee JE
 * File Name   : Tonal_MR_Merchant_Fee_JE.js
 * Description : This script is used for creation of merchant fee JE
 * Created On  : 09/02/2023
 * Modification Details:  
 ************************************************************/
let search,record,runtime
define(["N/search","N/record","N/runtime"], main);
function main(searchModule,recordModule,runtimeModule) {
    try {
        
        search = searchModule;
        record = recordModule;
        runtime = runtimeModule;

        return {
            getInputData: getInputData,
            map: map,
            // reduce: reduce,
            // summarize: summarize
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

const getInputData = () => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let searchId = scriptObj.getParameter('custscript_cd_data');
        let debitAccountId = scriptObj.getParameter('custscript_debit_acc');
        let creditAccountId = scriptObj.getParameter('custscript_debit_acc');
        if(!searchId || ! debitAccountId || !creditAccountId){
            return [];
        }
        return search.load({
            id: searchId
        });
    } catch (error) {
        log.error('Error : In GetImput Stage',error);
        return [];
    }
}

const map = (context) => {
    try {
        log.debug('mapContext==',context);
        let scriptObj = runtime.getCurrentScript();
        let debitAccountId = scriptObj.getParameter('custscript_debit_acc');
        let creditAccountId = scriptObj.getParameter('custscript_credit_acc');
        let cdId = context.key;
        let data = JSON.parse(context.value);
        let soId = data.values.appliedtotransaction.value;
        //step 1. Check CD is applied on DA
        let daDetails = getDAAppliedForCD(cdId);
        log.debug('daDetails=='+daDetails.length,daDetails);

        //step 2. Get Ccustomer refund by wocoom id 
        if(daDetails.length > 0){
            //check wocommerid,amount,status on so
            let soObj = search.lookupFields({
                type: search.Type.SALES_ORDER,
                id: soId,
                columns: ['otherrefnum','amount','status']
            });

            log.debug('soObj==',soObj);

            let woComId = soObj.otherrefnum;

            let crDetails = getCRByWocomId(woComId);
            log.debug('crDetails=='+crDetails.length,crDetails);
            //step 3. Compare CR and SO amount is equal and SO status pending fulfilemnt, create JE
            if(crDetails.length > 0){
                let soAmount = soObj.amount;
                let crAmount = crDetails[0].amount;
                let soStatus = soObj.status[0].value;
                log.debug('soAmount=='+soAmount,'crAmount=='+crAmount+'||soStatus=='+soStatus);
                if(soAmount == crAmount && soStatus == 'pendingFulfillment'){
                    //check merchent fee1 is create
                    let cdObj = search.lookupFields({
                        type: search.Type.CUSTOMER_DEPOSIT,
                        id: cdId,
                        columns: ['custbody_merchant_fee_je_1','custbody_payment_fee']
                    });
                    log.debug('cdObj==',cdObj);
                    //create merchant fee JE
                    if(cdObj.custbody_merchant_fee_je_1.length > 0){
                        let jeId = createMerchantJE(cdObj.custbody_payment_fee,debitAccountId,creditAccountId);
                        log.debug('jeId==',jeId);
                        if(jeId != false){
                            let id = record.submitFields({
                                type: record.Type.CUSTOMER_DEPOSIT,
                                id: cdId,
                                values: {
                                    custbody_merchant_fee_je_2:jeId
                                }  
                            });

                            if(id){
                                log.debug('CUSTOMER DEPOSITE ATTACHED WITH JE',cdId);
                            }
                        }
                    }
                }
            }
        }
        
    } catch (error) {
        log.error('Error : In Map Stage',error);
        return [];
    }
}

//function to get the DA for CD
const getDAAppliedForCD = (cdId) => {
    try {
        let depositapplicationSearchObj = search.create({
            type: "depositapplication",
            filters:
            [
               ["type","anyof","DepAppl"], 
               "AND", 
               ["appliedtotransaction","anyof",cdId]
            ],
            columns:
            [
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "appliedtotransaction", label: "Applied To Transaction"})
            ]
        });
        let searchResultCount = depositapplicationSearchObj.runPaged().count;
        log.debug("DA COUNT FOR CD",searchResultCount);
        let data = [];
        depositapplicationSearchObj.run().each(function(result){
            data.push({depositeApplicationId:result.id,depositeApplicationDocument:result.getValue('tranid'),customerDepositeId:result.getValue('appliedtotransaction')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get AD Applied FOr CD',error);
        return [];
    }
}

//function to get the customer refund by woocoom id
const getCRByWocomId = (wocomId) => {
    try {
        let customerrefundSearchObj = search.create({
            type: "customerrefund",
            filters:
            [
               ["type","anyof","CustRfnd"], 
               "AND", 
               ["mainline","is","F"], 
               "AND", 
               ["custbody3","contains",wocomId]
            ],
            columns:
            [
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "amount", label: "Amount"})
            ]
        });
        let searchResultCount = customerrefundSearchObj.runPaged().count;
        log.debug("CR COUNT",searchResultCount);
        let data = [];
        customerrefundSearchObj.run().each(function(result){
            data.push({customerRefundId:result.id,amount:result.getValue('amount')});
            return true;
        });
        return data;
    } catch (error) {
       log.error('Error : In Get CRByWocomId',error);
       return []; 
    }
} 

//function to create merchant JE
const createMerchantJE = (amount,debitAccount,creditAccount) => {
    try {
        let jeObj = record.create({
            type: record.Type.JOURNAL_ENTRY,
            isDynamic: true
        });

        //set subsidiary
        jeObj.setValue('subsidiary',1);

        //status
        jeObj.setValue('approvalstatus',2);//approved

        //set lines

        for(let l = 0 ; l <= 1 ; l++){
            jeObj.selectNewLine({
                sublistId: 'line'
            });

            //debit account,amount
            if(l == 0){
                jeObj.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'account',
                    value: debitAccount
                });

                jeObj.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'debit',
                    value: amount
                });
            }

            //credit account,amount
            if(l == 1){
                jeObj.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'account',
                    value: creditAccount
                });

                jeObj.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'credit',
                    value: amount
                });
            }

            jeObj.commitLine({
                sublistId: 'line'
            });
        }

        let jeId = jeObj.save();
        if(jeId){
            log.debug('New Mechannt Fee JE Created',jeId);
            return jeId;
        }

    } catch (error) {
       log.error('Error : In Create Merchant JE',error);
       return false; 
    }
}