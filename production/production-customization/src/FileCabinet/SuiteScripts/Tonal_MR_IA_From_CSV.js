/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
* File Header
* Script Type: Map Reduce
* Script Name: Tonal MR IA From CSV
* File Name  : Tonal_MR_IA_From_CSV.js
* Created On : 07/26/2024
* Modified On: 
* Created By : 
* Modified By: 
* Description: This is used for create IA form CSV file
************************************************************/
/**
 * Update history
 * Version      By          Date            Requested By                Description
 * V1           Vikash      04/09/2024      Binu/Client                 Modification for the IA tran date will be the recent date from the line which are belonging to one job
 * V2           Vikash      30/09/2024      Binu/Client                 Modification for theextrnal if creation and set , due to same JOB number going to used for few weeks so NS is not creation IA again with same external id which is JOb number from the csv.
 */
let runtime,file,search,record,email,uuid;
define(["N/runtime","N/file","N/search","N/record","N/email","N/crypto/random"], main);
function main(runtimeModule,fileModule,searchModule,recordModule,emailModule,uuidModule) {

    try {

        runtime = runtimeModule;
        file = fileModule;
        search = searchModule;
        record = recordModule;
        email = emailModule;
        uuid = uuidModule;

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
        let processingFolderId = scriptObj.getParameter('custscript_ia_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_ia_csv_processed_folderid');
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

        let lineNumber = Number(0),iaData = [];//created this counter to eliminate header of the file
        fileObj.lines.iterator().each(function (line) {
            lineNumber++;
            if(lineNumber > 1){
                let r = line.value.split(",");
                let job = r[0].trim(),pn = r[1],toLocation = r[2],fromLocation = r[3],date = r[4],total = r[5];
                
                let index = iaData.findIndex(function(obj){
                    return obj.job == job;
                });

                if(index == -1){
                    iaData.push({
                        job:job,
                        // date:date,
                        items:[{
                            sku:pn?pn.trim():"",
                            quantity:total,
                            line:lineNumber,
                            toLocation:toLocation?toLocation.trim():"",
                            fromLocation:fromLocation?fromLocation.trim():"",
                            date:date
                        }],
                        fileId:fileData[0].fileId
                    });
                }
                else{
                    iaData[index].items.push({sku:pn?pn.trim():"",quantity:total,line:lineNumber,toLocation:toLocation?toLocation.trim():"",fromLocation:fromLocation?fromLocation.trim():"",date:date});
                }
            }
            return true;
        });

        log.debug('iaData=='+iaData.length,iaData);
    
        return iaData;

    } catch (error) {
        log.error('Error : In Get Input',error);
        return [];
    }
}

const map = (context) => {
    let job,data;
    try {
        let scriptObj = runtime.getCurrentScript();
        let accountId = scriptObj.getParameter('custscript_ia_account')
        // log.debug('mapContext==',context);
        data = JSON.parse(context.value);
        //get the creditmeo id by externalid
        job = data.job;
        log.debug('job=='+job);
        let itemsDetails = data.items;
        let itemSkus = itemsDetails.map(a=>a.sku);
        // itemSkus =  [...new Set(itemSkus)];//dups remove
        log.debug('itemSkus=='+itemSkus.length,itemSkus);

        //get item by sku , if both the counts matches then only create the IA
        let nsItemDetails = checkForItem(itemSkus);
        log.debug('nsItemDetails=='+nsItemDetails.length,nsItemDetails);

        /* if(nsItemDetails.length != itemSkus.length){
            log.debug('Item Count Are Not Matching For '+job+' So, No IA Cration','Ok.');
            context.write({key:job,value:{data:data,status:false,fileId:data.fileId}});
            return ;
        } */

        //get the date form the items and check for the latest one date
        let iaTranDate = new Date(Math.max(...itemsDetails.map(e => new Date(e.date))));
        log.debug('iaTranDate==',iaTranDate);

        //sort the items for NS item internalid
        for(let i in itemsDetails){
            let index = nsItemDetails.findIndex(function(obj){
                return obj.skuCode == itemsDetails[i].sku;
            });
            if(index != -1){
                itemsDetails[i].itemId = nsItemDetails[index].internalId;
            }
        }

        log.debug('itemsDetails=='+itemsDetails.length,itemsDetails);

        nsItemDetails = itemsDetails;
        
        //create IA
        let iaObj = record.create({
            type: record.Type.INVENTORY_ADJUSTMENT,
            isDynamic: true
        });

        //set subsidiary
        iaObj.setValue('subsidiary',1);//tonal

        //set account
        iaObj.setValue('account',accountId);

        //set memo
        iaObj.setValue('memo',job);

        //set trandate 
        iaObj.setValue('trandate',iaTranDate);

        //set externalid
        iaObj.setValue('externalid',job+'_'+uuid.generateUUID());

        for(let x = 0 ; x < nsItemDetails.length ; x++){
            iaObj.selectNewLine({
                sublistId: 'inventory'
            });

            if(nsItemDetails[x].itemId == undefined){
                continue;
            }
            //set item
            iaObj.setCurrentSublistValue({
                sublistId: 'inventory',
                fieldId: 'item',
                value: nsItemDetails[x].itemId
            });

            let locationId = '';
            if(nsItemDetails[x].fromLocation){
                locationId = getMappingLocation(nsItemDetails[x].fromLocation);
                if(locationId.length > 0){
                    locationId = locationId[0].locationId;
                }
            }
            if(nsItemDetails[x].toLocation){
                locationId = getMappingLocation(nsItemDetails[x].toLocation);
                if(locationId.length > 0){
                    locationId = locationId[0].locationId;
                }
            }
            // log.debug('locationId==',locationId);
            //location
            iaObj.setCurrentSublistValue({
                sublistId: 'inventory',
                fieldId: 'location',
                value: locationId
            });

            //qunatity
            iaObj.setCurrentSublistValue({
                sublistId: 'inventory',
                fieldId: 'adjustqtyby',
                value: nsItemDetails[x].quantity
            });

            iaObj.commitLine({
                sublistId: 'inventory'
            });
        }

        var newIARecId = iaObj.save();
        if(newIARecId){
            log.debug('New IA Created==',newIARecId);
            context.write({key:job,value:{data:data,status:true,iaId:newIARecId,fileId:data.fileId}});
        }
        
    } catch (error) {
        log.error('Error : In Map While Porcessing JOB=='+job,error);
        context.write({key:job,value:{data:data,status:false,fileId:data.fileId,error:error.message}});
    }
}

const reduce = (context) => {
    try {
        // log.debug('reduceContext==',context);
        let job = context.key; 
        let data = JSON.parse(context.values[0]);
        context.write({key:job,value:data});
    } catch (error) {
        log.error('Error : In Reduce',error);
    }
}

const summarize = (summary) => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let processingFolderId = scriptObj.getParameter('custscript_ia_csv_processing_folderid');
        let processedFolderId = scriptObj.getParameter('custscript_ia_csv_processed_folderid');
        let emailSender = scriptObj.getParameter('custscript_ia_csv_emailsender');
        let emailReceivers = scriptObj.getParameter('custscript_ia_csv_emailreceivers');
        let successData = [],failData = [],fileId = '';
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'IA',
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

        //send email for the failure with csv attachment
        if(failData.length > 0){
            let csvFile = 'Job,File Id,Error,Status\r\n';
            for(let c in failData){
                //Add each result as a new line on CSV
                csvFile += failData[c].data.job+','+failData[c].fileId+','+failData[c].error+','+failData[c].status+'\r\n';
            }

            //Creation of file,and send email
            try {
                var fileObj = file.create({
                    name: 'Inventory Adjustmnet Error While Porcessing Csv - ' + new Date().getTime() +'.csv',
                    fileType: file.Type.CSV,
                    contents: csvFile,
                    encoding: file.Encoding.UTF8,
                });

                //split the email in size of 10 due to lilitations of email send max 10 members
                let emailSplit = emailReceivers.split(',');
                let chunkSize = 10;
                for (let i = 0; i < emailSplit.length; i += chunkSize) {
                    let chunk = emailSplit.slice(i, i + chunkSize);
                    let receviers = [];
                    for(let count in chunk){
                        receviers.push(chunk[count]);
                    }

                    email.send({
                        author: emailSender,
                        body: 'Hi Team,<br/><br/>Please find the attached file for error refrence while processinng the CSV file for Inventory Adjustment creation in NetSuite.<br/><br/>Thanks,<br>-NetSuite Alert',
                        recipients: receviers,
                        subject: 'Inventory Adjustmnet Error While Porcessing Csv',
                        attachments: [fileObj]
                    });
                    log.debug('EMAIL SENT','OK');
                }
            } catch (error) {
                log.error('Error : In Create CSV FILE/EMAIL',error);
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

//function to get the item details
const checkForItem = (skus) => {
    try {
        let data = new Array();
        let filters = [],finalfilters = [];
        finalfilters.push(["isinactive","is","F"]);
        finalfilters.push("AND");
        // finalfilters.push(["type","anyof","InvtPart"]);
        finalfilters.push([["type","anyof","InvtPart"],"OR",["type","anyof","Assembly"]]);
        finalfilters.push("AND");
        for(let f = 0  ; f < skus.length ; f++){
            filters.push(["name","is",skus[f]]);
            if(f < skus.length-1){
                filters.push("OR");
            } 
        }
        finalfilters.push(filters);
        let itemSearchObj = search.create({
            type: "item",
            filters:finalfilters,
            columns:
            [
                search.createColumn({name: "itemid", label: "Name"}),
                search.createColumn({name: "displayname", label: "Display Name"}),
                search.createColumn({name: "type", label: "Type"})
            ]
        });
        var searchResultCount = itemSearchObj.runPaged().count;
        log.debug("Item Count",searchResultCount);
        itemSearchObj.run().each(function(result){
            data.push({"skuCode":result.getValue('itemid'), "displayName":result.getValue('displayname'),"internalId":result.id});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Check Item',error);
        return [];
    }
}

//function to get the mapping location details
const getMappingLocation = (locationName) => {
    try {
        let locationDetail = [],locationDetails = {};
        if(runtime.envType == 'SANDBOX'){
            locationDetails = {
                "EX" : 17,//"Extron NW",
                "MRB" : 27,//"MRB: TRMA Extron"
                "NB" : 27,//"MRB: TRMA Extron"
                "QUAR" : 27,//"MRB: TRMA Extron"  
                "REBX" : 27,//"MRB: TRMA Extron"
                "REWORK" : 27,//"MRB: TRMA Extron"
                "RMA" : 27,//"MRB: TRMA Extron"
                "SCRAP" : 33,//"MRB: TSSCRAP Extron"
                "TEMPINV" : 27,//"MRB: TRMA Extron"
                "TSQUAR" : 27//"MRB: TRMA Extron"
            }
        }
        if(runtime.envType == 'PRODUCTION'){
            locationDetails = {
                "EX" : 17,//"Extron NW",
                "MRB" : 27,//"MRB: TRMA Extron"
                "NB" : 27,//"MRB: TRMA Extron"
                "QUAR" : 27,//"MRB: TRMA Extron"  
                "REBX" : 27,//"MRB: TRMA Extron"
                "REWORK" : 27,//"MRB: TRMA Extron"
                "RMA" : 27,//"MRB: TRMA Extron"
                "SCRAP" : 33,//"MRB: TSSCRAP Extron"
                "TEMPINV" : 27,//"MRB: TRMA Extron"
                "TSQUAR" : 27//"MRB: TRMA Extron"
            }
        }
        for(const l in locationDetails) {
            // log.debug('location==',`${l}: ${locationDetails[l]}`);
            if(locationName == l){
                locationDetail.push({locationId:locationDetails[l],locationName:l});
                break;
            }
        }
        log.debug('locationDetail=='+locationDetail.length,locationDetail);
        return locationDetail;
    } catch (error) {
        log.error('Error : In Get Mapping Location',error);
        return [];
    }
}