/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
* File Header
* Script Type: Map Reduce
* Script Name: Tonal MR JE Processing Customer Deposits and Customer Refunds Update
* File Name  : Tonal_JE_Processing_CD_And_CR_Update.js
* Created On : 05/14/2024
* Modified On: 
* Created By : 
* Modified By: 
* Description: This is used for update CR/CD form CSV file
************************************************************/
/**
 * Update history
 * Version      By          Date            Requested By                Description
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
        let deployemntId = scriptObj.deploymentId;
        let processingFolderId = scriptObj.getParameter('custscript_crcd_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_crcd_csv_processed_folderid');
        log.debug('processingFolderId=='+processingFolderId,'processedFolderId=='+processedFolderId);
        if(!processingFolderId || !processedFolderId){
            return [];
        }

        let processingSplitedFolder =  processingFolderId.split(',');
        let processedSplitedFolder =  processedFolderId.split(',');
        let crprocessingFolderId = processingSplitedFolder[0];
        let crprocessedFolderId = processedSplitedFolder[0];
        let cdprocessingFolderId =  processingSplitedFolder[1];
        let cdprocessedFolderId = processedSplitedFolder[1];
        let fileData = [];

        log.debug('crprocessingFolderId=='+crprocessingFolderId,'crprocessedFolderId=='+crprocessedFolderId);
        log.debug('cdprocessingFolderId=='+cdprocessingFolderId,'cdprocessedFolderId=='+cdprocessedFolderId);
        //check deplyment id for the folder decision, index 1 for cd, idex 2 for cr
        if(deployemntId == 'customdeploy_tnl_cr_update'){
            fileData = getCsvFileFormProcessingFolder(crprocessingFolderId,'CR');
        }
        if(deployemntId == 'customdeploy_tnl_cd_update'){
            fileData = getCsvFileFormProcessingFolder(cdprocessingFolderId,'CD');
        }
        
        log.debug('fileData=='+fileData.length,fileData);
        if(fileData.length == 0 || fileData.length > 1){
            return [];
        }
        
        let fileObj = file.load({
            id: fileData[0].fileId
        });

        // log.debug('fileObj==',fileObj);

        let lineNumber = Number(0),data = [];//created this counter to eliminate header of the file
        fileObj.lines.iterator().each(function (line) {
            lineNumber++;
            if(lineNumber > 1){
                let r = line.value.split(","),recId,merchanteJe1,merchanteJe2;
                if(deployemntId == 'customdeploy_tnl_cr_update'){
                    recId = r[0],merchanteJe1 = r[1];
                    data.push({
                        type:'CR',
                        recId:recId,
                        merchanteJe1:merchanteJe1,
                        fileId:fileData[0].fileId
                    });
                }
                if(deployemntId == 'customdeploy_tnl_cd_update'){
                    recId = r[0],merchanteJe1 = r[1],merchanteJe2 = r[2];
                    data.push({
                        type:'CD',
                        recId:recId,
                        merchanteJe1:merchanteJe1,
                        merchanteJe2:merchanteJe2,
                        fileId:fileData[0].fileId
                    });
                }
                
            }
            return true;
        });

        log.debug('data=='+data.length,data);
    
        return data;

    } catch (error) {
        log.error('Error : In Get Input',error);
        return [];
    }
}

const map = (context) => {
    try {
        // log.debug('mapContext==',context);
        let data = JSON.parse(context.value);
        //get the type and recid
        let recType = data.type;
        let recId = data.recId;
        log.debug('recType=='+recType,'recId=='+recId);
        if(recType == 'CD'){
            let mje1 = data.merchanteJe1;
            let mje2 = data.merchanteJe2;
            let filedValues = {};
            if(mje1){
                filedValues.custbody_merchant_fee_je_1 = mje1;
            }
            if(mje2){
                filedValues.custbody_merchant_fee_je_2 = mje2;
            }
            log.debug('filedValuesCD==',filedValues);
            let id = record.submitFields({
                type: record.Type.CUSTOMER_DEPOSIT,
                id: recId,
                values: filedValues
            });
            if(id){
                log.debug('CD UPDATED WITH MJE',id);
                context.write({key:id,value:{data:data,status:true,customerDepositeId:id,fileId:data.fileId}});
            }
            
        }
        if(recType == 'CR'){
            let mje1 = data.merchanteJe1;
            let filedValues = {};
            if(mje1){
                filedValues.custbody_merchant_fee_je_1 = mje1;
            }
            log.debug('filedValuesCR==',filedValues);
            let id = record.submitFields({
                type: record.Type.CUSTOMER_REFUND,
                id: recId,
                values: filedValues
            });
            if(id){
                log.debug('CR UPDATED WITH MJE',id);
                context.write({key:id,value:{data:data,status:true,customerRefundId:id,fileId:data.fileId}});
            }
        }
    } catch (error) {
        log.error('Error : In Map',error);
        context.write({key:id,value:{data:data,status:false,fileId:data.fileId}});
    }
}

const reduce = (context) => {
    try {
        // log.debug('reduceContext==',context);
        let recId = context.key; 
        let data = JSON.parse(context.values[0]);
        context.write({key:recId,value:data});
    } catch (error) {
        log.error('Error : In Reduce',error);
    }
}

const summarize = (summary) => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let deployemntId = scriptObj.deploymentId;
        let processingFolderId = scriptObj.getParameter('custscript_crcd_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_crcd_csv_processed_folderid');

        let processingSplitedFolder =  processingFolderId.split(',');
        let processedSplitedFolder =  processedFolderId.split(',');
        let crprocessingFolderId = processingSplitedFolder[0];
        let crprocessedFolderId = processedSplitedFolder[0];
        let cdprocessingFolderId =  processingSplitedFolder[1];
        let cdprocessedFolderId = processedSplitedFolder[1];
        let successData = [],failData = [],fileId = '';
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'CD/CR',
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
            if(deployemntId == 'customdeploy_tnl_cr_update'){
                processedFolderId = crprocessedFolderId;
            }
            if(deployemntId == 'customdeploy_tnl_cd_update'){
                processedFolderId = cdprocessedFolderId;
            }
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
const getCsvFileFormProcessingFolder = (folderId,recType) => {
    try {
        let folderIds = '';
        if(recType == 'CR'){
            folderIds = folderId;
        }
        if(recType == 'CD'){
            folderIds = folderId
        }
        let fileSearchObj = search.create({
            type: "file",
            filters:
            [
               ["folder","anyof",folderIds]
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