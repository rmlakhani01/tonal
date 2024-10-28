/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
* File Header
* Script Type: Map Reduce
* Script Name: Tonal MR Customer Refund Csv Import
* File Name  : Tonal_MR_Customer_Refund_Csv_Import.js
* Created On : 03/12/2024
* Modified On: 
* Created By : 
* Modified By: 
* Description: This is used for create CR form CSV file
************************************************************/
/**
 * Update history
 * Version      By          Date            Requested By                Description
 * V1           Vikash      19/03/2024      Binu                         modification for the following
 *                                                                       1. Instead of Memo from the below sheet to the memo on the customer refund, Kindly use the column called 'Memo for customer refunds'. 
 *                                                                       2. The Charge ID needs to be mapped to a field called 'Stripe charge ID' on the customer refund 
 * V2           Vikash      20/03/2024      Binu                         modification for the apply CDE on CR
 * V3           Vikash      21/03/2024      Binu                         modification for the apply CDE on CR, if CM is not avilable by externalid in NS
 */
let runtime,file,search,record;
define(["N/runtime","N/file","N/search","N/record"], main);
function main(runtimeModule,fileModule,searchModule,recordModule) {

    try {

        runtime = runtimeModule;
        file = fileModule;
        search = searchModule;
        record = recordModule;

        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summarize
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

const getInputData = () => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let processingFolderId = scriptObj.getParameter('custscript_cr_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_cr_csv_processed_folderid');
        log.debug('processingFolderId=='+processingFolderId,'processedFolderId=='+processedFolderId);
        if(!processingFolderId || !processedFolderId){
            return [];
        }

        let fileData = getCsvFileFormProcessingFolder(processingFolderId);
        log.debug('fileData=='+fileData.length,fileData);
        if(fileData.length == 0 || fileData.length > 1){
            return [];
        }
        
        let fileObj = file.load({
            id: fileData[0].fileId
        });

        // log.debug('fileObj==',fileObj);

        let lineNumber = Number(0),customerRefundData = [];//created this counter to eliminate header of the file
        fileObj.lines.iterator().each(function (line) {
            lineNumber++;
            if(lineNumber > 1){
                let r = line.value.split(",");
                let creditMemoExternalId = r[14],date = r[1],chargeId = r[2],customerId = r[3],number = r[4],customerEmail = r[5],stateAbb = r[6],amount = r[7],
                memo = r[17],WCOrder = r[12],refundAmount = r[15],payout = r[16],deposit = r[18],depositAmount = r[19];
                
                customerRefundData.push({
                    creditMemoExternalId:creditMemoExternalId,
                    date:date,
                    chargeId:chargeId,
                    customerId:customerId,
                    number:number,
                    customerEmail:customerEmail,
                    stateAbb:stateAbb,
                    amount:amount,
                    memo:memo,
                    WCOrder:WCOrder,
                    refundAmount:refundAmount,
                    payout:payout,
                    fileId:fileData[0].fileId,
                    deposit:deposit,
                    depositAmount:depositAmount,
                });
            }
            return true;
        });

        log.debug('customerRefundData=='+customerRefundData.length,customerRefundData);
    
        return customerRefundData;

    } catch (error) {
        log.error('Error : In Get Input',error);
        return [];
    }
}

const map = (context) => {
    try {
        // log.debug('mapContext==',context);
        let data = JSON.parse(context.value);
        //get the creditmeo id by externalid
        let cmExternalId = data.creditMemoExternalId;
        let cmData = getCreditMemoByExternalId(cmExternalId);
        log.debug('cmData=='+cmData.length,cmData);
        let customerDeposit = data.deposit;
        let depositAmount = data.depositAmount;
        //create CR with appy CD/CM
        if(cmData.length > 0){
            log.debug('CASE1 RUNNING','OK..');
            let crObj = record.create({
                type: record.Type.CUSTOMER_REFUND,
                isDynamic: true,
            });

            //set customer
            crObj.setValue('customer',cmData[0].customerId);

            //set date
            crObj.setValue('trandate',new Date(data.date));

            //set meo
            crObj.setValue('memo',data.memo);

            //set wocomid
            crObj.setValue('custbody3',data.WCOrder);

            //set payout
            crObj.setValue('custbody_stripepayoutid',data.payout);

            //set externalid
            //added by Ali A > Adding a "cr" to make sure the external id of the Customer Refund is unique
            crObj.setValue('externalid','cr_' + cmExternalId);

            //set payment method
            crObj.setValue('paymentmethod',11)//Stripe

            //set chargeid
            crObj.setValue('custbody_stripe_charge_id',data.chargeId);

            //make apply true, and set amount where cm id matches in apply line
            let appliedCM = false,appliedCD = false;
            let lineCount = crObj.getLineCount('apply');
            // log.debug('lineCount==',lineCount);
            for(let l = 0 ; l < lineCount ; l++){
                let cmId = crObj.getSublistValue({
                    sublistId: 'apply',
                    fieldId: 'internalid',
                    line: l
                });

                // log.debug('cmId=='+cmId);

                if(cmId == cmData[0].creditmemoInternalId){
                    crObj.selectLine({
                        sublistId: 'apply',
                        line: l
                    });

                    crObj.setCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'apply',
                        value: true
                    });

                    crObj.setCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'amount',
                        value: data.refundAmount
                    });

                    crObj.commitLine({
                        sublistId: 'apply'
                    });

                    appliedCM = true;
                }
            }

            if(customerDeposit && depositAmount){
                let depositeLineCount = crObj.getLineCount('deposit');
                for(let d = 0 ; d < depositeLineCount ; d++){
                    let cdId = crObj.getSublistValue({
                        sublistId: 'deposit',
                        fieldId: 'refnum',
                        line: d
                    });
    
                    // log.debug('cdId=='+cdId);
    
                    if(cdId == customerDeposit){
                        crObj.selectLine({
                            sublistId: 'deposit',
                            line: d
                        });
    
                        crObj.setCurrentSublistValue({
                            sublistId: 'deposit',
                            fieldId: 'apply',
                            value: true
                        });
    
                        crObj.setCurrentSublistValue({
                            sublistId: 'deposit',
                            fieldId: 'amount',
                            value: depositAmount
                        });
    
                        crObj.commitLine({
                            sublistId: 'deposit'
                        });
    
                        appliedCD = true;
                    }
    
                }
            }

            log.debug('appliedCM=='+appliedCM,'appliedCD=='+appliedCD);

            if(appliedCM == true || appliedCD == true){
                let crId = crObj.save();
                if(crId){
                    log.debug('New Customer Refund Created For CM=='+cmData[0].creditmemoInternalId,crId);
                    context.write({key:cmExternalId,value:{data:data,status:true,customerRefundId:crId,fileId:data.fileId}});
                }
            }
            else{
                context.write({key:cmExternalId,value:{data:data,status:false,fileId:data.fileId}});
            }
        }
        //create CR with appy CD only
        else if(cmData.length == 0 && customerDeposit && depositAmount){
            log.debug('CASE2 RUNNING','OK..');
            let crObj = record.create({
                type: record.Type.CUSTOMER_REFUND,
                isDynamic: true,
            });


            let customerData = [];
            if(data.customerEmail){
                customerData = getCustomerByExternalId(data.customerEmail);
                log.debug('customerDataByEmailASEXternalId=='+customerData.length,customerData);
            }
           
            if(customerData.length == 0){
                if(data.customerId){
                    customerData = getCustomerByCustomerId(data.customerId);
                    log.debug('customerDataByCustomerIdASEXternalId=='+customerData.length,customerData);
                }
            }

            if(customerData.length == 0){
                context.write({key:cmExternalId,value:{data:data,status:false,fileId:data.fileId}});
                return;
            }

            //set customer
            crObj.setValue('customer',customerData[0].customerId);

            //set date
            crObj.setValue('trandate',new Date(data.date));

            //set meo
            crObj.setValue('memo',data.memo);

            //set wocomid
            crObj.setValue('custbody3',data.WCOrder);

            //set payout
            crObj.setValue('custbody_stripepayoutid',data.payout);

            //set externalid
            crObj.setValue('externalid',cmExternalId);

            //set payment method
            crObj.setValue('paymentmethod',11)//Stripe

            //set chargeid
            crObj.setValue('custbody_stripe_charge_id',data.chargeId);

            let appliedCD = false;

            let depositeLineCount = crObj.getLineCount('deposit');
            for(let d = 0 ; d < depositeLineCount ; d++){
                let cdId = crObj.getSublistValue({
                    sublistId: 'deposit',
                    fieldId: 'refnum',
                    line: d
                });

                // log.debug('cdId=='+cdId);

                if(cdId == customerDeposit){
                    crObj.selectLine({
                        sublistId: 'deposit',
                        line: d
                    });

                    crObj.setCurrentSublistValue({
                        sublistId: 'deposit',
                        fieldId: 'apply',
                        value: true
                    });

                    crObj.setCurrentSublistValue({
                        sublistId: 'deposit',
                        fieldId: 'amount',
                        value: depositAmount
                    });

                    crObj.commitLine({
                        sublistId: 'deposit'
                    });

                    appliedCD = true;
                }

            }

            log.debug('appliedCD==',appliedCD);
            if(appliedCD == true){
                let crId = crObj.save();
                if(crId){
                    log.debug('New Customer Refund Created For CD=='+customerDeposit,crId);
                    context.write({key:cmExternalId,value:{data:data,status:true,customerRefundId:crId,fileId:data.fileId}});
                }
            }
        }
        else{
            context.write({key:cmExternalId,value:{data:data,status:false,fileId:data.fileId}});
        }
    } catch (error) {
        log.error('Error : In Map',error);
        context.write({key:cmExternalId,value:{data:data,status:false,fileId:data.fileId}});
    }
}

const reduce = (context) => {
    try {
        // log.debug('reduceContext==',context);
        let cmExternalIdId = context.key; 
        let data = JSON.parse(context.values[0]);
        context.write({key:cmExternalIdId,value:data});
    } catch (error) {
        log.error('Error : In Reduce',error);
    }
}

const summarize = (summary) => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let processingFolderId = scriptObj.getParameter('custscript_cr_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_cr_csv_processed_folderid');
        let successData = [],failData = [],fileId = '';
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'Customer Refund',
                details: 'key: ' + key + ' / value: ' + value
            }); */

            const data = JSON.parse(value);

            if (data.status == true) {
                successData.push(data);
                if(!fileId)
                fileId = data.fileId;
            }
            if (data.status == false) {
                failData.push(data);
            }
            return true;
        });
        log.debug('successData=='+successData.length,successData);
        log.debug('failData=='+failData.length,failData);
        log.debug('fileId==',fileId);
        //remove the processed file form folder and place it another folder
        if(successData.length > 0 && failData.length == 0){
            let copyfileObj = file.copy({
                id: Number(fileId),
                folder: Number(processedFolderId)
            });

            copyfileObj.name = 'Prcessed - '+new Date().getTime() + ' - '+copyfileObj.name;

            let copfyFileId = copyfileObj.save();
            if(copfyFileId){
                log.debug('Original File=='+fileId,'Copied To Porcessed Folder=='+copfyFileId);
                file.delete({
                    id: Number(fileId)
                });
            }
        }
    } catch (error) {
        log.error('Error : In Summarize',error);
    }
}

//function to get the data for processing
const getCsvFileFormProcessingFolder = (folderId) => {
    try {
        let fileSearchObj = search.create({
            type: "file",
            filters:
            [
               ["folder","anyof",folderId]
            ],
            columns:
            [
               search.createColumn({
                  name: "name",
                  sort: search.Sort.ASC,
                  label: "Name"
               }),
               search.createColumn({name: "folder", label: "Folder"}),
               search.createColumn({name: "documentsize", label: "Size (KB)"}),
               search.createColumn({name: "url", label: "URL"}),
               search.createColumn({name: "created", label: "Date Created"}),
               search.createColumn({name: "modified", label: "Last Modified"}),
               search.createColumn({name: "filetype", label: "Type"})
            ]
        });
        var searchResultCount = fileSearchObj.runPaged().count;
        log.debug("File Count Under Processing Folder",searchResultCount);
        let data = [];
        fileSearchObj.run().each(function(result){
            data.push({fileName:result.getValue('name'),fileId:result.id,fileSize:result.getValue('documentsize'),fileType:result.getValue('filetype')})
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get CSV File Form Folder',error);
        return [];
    }
}

//function to get the creditmemo by externalid
const getCreditMemoByExternalId = (cmExternalId) => {
    try {
        let transactionSearchObj = search.create({
            type: "transaction",
            filters:
            [
               ["externalidstring","is",cmExternalId], 
               "AND", 
               ["mainline","is","T"]
            ],
            columns:
            [
                search.createColumn({name: "tranid", label: "Document Number"}),
                search.createColumn({name: "externalid", label: "External ID"}),
                search.createColumn({name: "entity", label: "Name"}),
                search.createColumn({
                    name: "internalid",
                    join: "customerMain",
                    label: "Internal ID"
                })
            ]
        });
        let searchResultCount = transactionSearchObj.runPaged().count;
        log.debug("CM Count",searchResultCount);
        let data = [];
        transactionSearchObj.run().each(function(result){
            data.push({creditmemoInternalId:result.id,externalId:result.getValue('externalid'),tranId:result.getValue('tranid'),customerId:result.getValue('entity')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Credit Memo By ExternalId',error);
        return [];
    }
}

//function to get the customer id by externalid
const getCustomerByExternalId = (email) => {
    try {
        let customerSearchObj = search.create({
            type: "customer",
            filters:
            [
               ["isinactive","is","F"], 
               "AND", 
               ["externalidstring","is",email.trim()]
            ],
            columns:
            [
               search.createColumn({
                  name: "entityid",
                  sort: search.Sort.ASC,
                  label: "ID"
               }),
               search.createColumn({name: "altname", label: "Name"})
            ]
        });
        let searchResultCount = customerSearchObj.runPaged().count;
        log.debug("Customer Count By ExternalId",searchResultCount);
        let data = [];
        customerSearchObj.run().each(function(result){
            data.push({customerId:result.id,name:result.getValue('altname')})
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Customer By ExternalId',error);
    }
}

//function to get the customer id by externalid
const getCustomerByCustomerId = (customerId) => {
    try {
        let customerSearchObj = search.create({
            type: "customer",
            filters:
            [
               ["isinactive","is","F"], 
               "AND", 
               ["externalidstring","is",customerId.trim()]
            ],
            columns:
            [
               search.createColumn({
                  name: "entityid",
                  sort: search.Sort.ASC,
                  label: "ID"
               }),
               search.createColumn({name: "altname", label: "Name"})
            ]
        });
        let searchResultCount = customerSearchObj.runPaged().count;
        log.debug("Customer Count By CustomerId",searchResultCount);
        let data = [];
        customerSearchObj.run().each(function(result){
            data.push({customerId:result.id,name:result.getValue('altname')})
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Customer By CustomerId',error);
    }
}