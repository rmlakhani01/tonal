/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
* File Header
* Script Type: Map Reduce
* Script Name: Tonal MR Customer Refund Csv Import Date Update
* File Name  : Tonal_MR_Customer_Refund_Csv_Import_Date_Update.js
* Created On : 03/28/2024
* Modified On: 
* Created By : 
* Modified By: 
* Description: This is used for update the CR date form CSV file
************************************************************/
/**
 * Update history
 * Version      By          Date            Requested By                Description
 * V1           Vikash      02/04/2024      Binu                        Modification for the setting posting period
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
        let processingFolderId = scriptObj.getParameter('custscript_crd_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_crd_csv_processed_folderid');
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
                let customerRefundExternalId = r[0],customerRefundInternalId = r[1],date = r[2],postingPeriod = r[3];
                
                customerRefundData.push({
                    customerRefundExternalId:customerRefundExternalId,
                    customerRefundInternalId:customerRefundInternalId,
                    date:date,
                    fileId:fileData[0].fileId,
                    postingPeriod:postingPeriod
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
        //get the creid by externalid or internalid
        let crExternalId = data.customerRefundExternalId;
        let crInternalId = data.customerRefundInternalId;
        let crDate = data.date;
        let pp = data.postingPeriod
        let crData = getCustomerRefundByExternalId(crExternalId,crInternalId);
        log.debug('crData=='+crData.length,crData);
        //create CR with appy CD/CM
        if(crData.length > 0 && crDate){
            //get the PP record internal id 
            let ppData = getPostingPeriodDetails(pp);
            log.debug('ppData=='+ppData.length,ppData);
            let id = record.submitFields({
                type: 'customerrefund',
                id: crData[0].customerRefundInternalId,
                values: {
                    trandate: crDate,
                    postingperiod:ppData[0].ppId
                }
            });
            if(id){
                log.debug('CR DATE UPDATED SUCESSFULLY!!',id);
                if(crExternalId){
                    context.write({key:crExternalId,value:{data:data,status:true,fileId:data.fileId}});
                }
                if(crInternalId){
                    context.write({key:crInternalId,value:{data:data,status:true,fileId:data.fileId}});
                }
            }
            else{
                log.debug('CR DATE UPDATED UNSUCESSFULLY!!',crExternalId);
                if(crExternalId){
                    context.write({key:crExternalId,value:{data:data,status:true,fileId:data.fileId}});
                }
                if(crInternalId){
                    context.write({key:crInternalId,value:{data:data,status:true,fileId:data.fileId}});
                }
            }
        }
    } catch (error) {
        log.error('Error : In Map',error);
        if(crExternalId){
            context.write({key:crExternalId,value:{data:data,status:true,fileId:data.fileId}});
        }
        if(crInternalId){
            context.write({key:crInternalId,value:{data:data,status:true,fileId:data.fileId}});
        }
    }
}

const reduce = (context) => {
    try {
        log.debug('reduceContext==',context);
        let keyId = context.key; 
        let data = JSON.parse(context.values[0]);
        context.write({key:keyId,value:data});
    } catch (error) {
        log.error('Error : In Reduce',error);
    }
}

const summarize = (summary) => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let processingFolderId = scriptObj.getParameter('custscript_crd_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_crd_csv_processed_folderid');
        let successData = [],failData = [],fileId = '';
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'Customer Refund Date Update',
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
const getCustomerRefundByExternalId = (crExternalId,crInternalId) => {
    try {
        let filter = [];
        filter.push(["type","anyof","CustRfnd"]);
        filter.push('AND');
        filter.push(["mainline","is","T"]);
        if(crExternalId){
            filter.push('AND');
            filter.push(["externalidstring","is",crExternalId]);
        }
        if(crInternalId){
            filter.push('AND');
            filter.push(["internalid","anyof",crInternalId]);
        }
        let transactionSearchObj = search.create({
            type: "customerrefund",
            filters:filter,
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
        log.debug("CR Count",searchResultCount);
        let data = [];
        transactionSearchObj.run().each(function(result){
            data.push({customerRefundInternalId:result.id,externalId:result.getValue('externalid'),tranId:result.getValue('tranid'),customerId:result.getValue('entity')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Customer Refund By ExternalId',error);
        return [];
    }
}

//function to get the accounting period 
const getPostingPeriodDetails = (pp) => {
    try {
        let accountingperiodSearchObj = search.create({
            type: "accountingperiod",
            filters:
            [
               ["periodname","is",pp.trim()]
            ],
            columns:
            [
               search.createColumn({name: "periodname", label: "Name"})
            ]
        });
        let searchResultCount = accountingperiodSearchObj.runPaged().count;
        log.debug("Accounting Period Count",searchResultCount);
        let data = [];
        accountingperiodSearchObj.run().each(function(result){
            data.push({ppId:result.id});
            return true;
        });
        return data;
    } catch (error) {
        
    }
}