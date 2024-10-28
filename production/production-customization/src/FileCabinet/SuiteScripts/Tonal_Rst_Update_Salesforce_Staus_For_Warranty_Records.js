/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet
 * Script Name : Tonal Rst Update Salesforce Staus For Warranty Records
 * File Name   : Tonal_Rst_Update_Salesforce_Staus_For_Warranty_Records.js
 * Description : This script is used for update SlaesForce sync true to the warranty record
 * Created On  : 01/09/2023
 * Modification Details:  
 *
 ************************************************************/
/**
 * Update History
 * Version          Date            By              Requested By                    Description
 * V1               09/09/2023      Vikash                                          Modifciation for the payload,data limit, and get warranty rrc id for the update
 * V2               29/09/2023      Vikash          Joanna                          Modification for the error out warranty satmping
 * V3               04/10/2023      Vikash                                          Modification for the stamping SF error details on warranty
 */
define(
    [
        "N/record",
        "N/search"
    ], function(record,search) {

    const updateSalesForceStatusOnWarrantyRecord = (context) => {
        try {
            const payload = context;
            log.debug('payload==',payload);
            if(!payload){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'INVALID_PAYLOAD',
                        message:'Please provide data for warranty update.'
                    }
                };
            }

            //validate for limit
            let limit = payload.limit;
            log.debug('limit==',limit);
            if(!limit || limit == undefined){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'LIMIT_MISSING',
                        message:'Please provide limit for warranty update.'
                    }
                };
            }

            if(limit > 50 || limit <= 0){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'LIMIT_EXCEDING',
                        message:'Please provide limit of 50 sales order per api for warranty update.'
                    }
                };
            }

            //validate for warranty data 
            const warrantyDatas = payload.warrantyData;
            log.debug('warrantyDatas==',warrantyDatas);
            if(!warrantyDatas || warrantyDatas == undefined){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'WARRANTY_DATA_MISSING',
                        message:'Please provide warranty data for warranty update.'
                    }
                };
            }

            //validate for the data manadatory
            let dataLength = payload.warrantyData.length;
            log.debug('dataLength==',dataLength);
            if(dataLength == 0){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'NO_DATA',
                        message:'Please provide sales order data for sales warranty update.'
                    }
                };
            }

            //loop over the data and make search for all the warranty record and update the SF status
            const successDetails = [], failureDetails = [];
            for(let d in warrantyDatas){
                try {
                    const data = warrantyDatas[d];
                    log.debug('data==',data);
                    let soId = data.salesOrderId;
                    log.debug('Processing for the So#==',soId);
                    //get the warranty details for the sales order
                    let warrantyData = getAllWarrantyRecordDetails(soId);
                    log.debug('warrantyData=='+warrantyData.length,warrantyData);
                    //success, warranty count avilable
                    if(warrantyData.length >0){
                        let p_warranty = data.warranty;
                        log.debug('p_warranty=='+p_warranty.length,p_warranty);
                        //get the respective warranty record id based on item id and update the SF status
                        for(let w in warrantyData){

                            let warrantyRecId = warrantyData[w].rec_id;
                            let index = p_warranty.findIndex(function(e){
                                return e.id == warrantyRecId;
                            });

                            if(index != -1){
                                //check for the warranty tarnsaction status
                                let wTransStatus = p_warranty[index].transactionStatus;
                                log.debug('wTransStatus==',wTransStatus);
                                if(wTransStatus == 'Success'){
                                    let id = record.submitFields({
                                        type: 'customrecord_warranty',
                                        id: warrantyData[w].rec_id,
                                        values: {
                                            custrecord_synced_salesforce:p_warranty[index].syncedToSalesforce
                                        }
                                    });
                                    if(id){
                                        log.debug('Warranty Rec Updated Which SF status #'+id,'SO#'+data.salesOrderId);
                                        successDetails.push(p_warranty[index]);
                                    }
                                }
                                else{
                                    let id = record.submitFields({
                                        type: 'customrecord_warranty',
                                        id: warrantyData[w].rec_id,
                                        values: {
                                            custrecord_warranty_status:6,//errored
                                            custrecord_synced_salesforce:p_warranty[index].syncedToSalesforce,
                                            custrecord_warranty_sf_error_details:p_warranty[index].errorDetails
                                        }
                                    });
                                    if(id){
                                        log.debug('Warranty Rec Updated SF status Fail #'+id,'SO#'+data.salesOrderId);
                                        failureDetails.push(p_warranty[index]);
                                    }
                                    
                                }
                            }
                        }
                    }
                    //failure, no warranty count
                    else{
                        failureDetails.push(data);
                    }
                } catch (error) {
                    log.error('Error : While Processing So#'+warrantyDatas[d].salesOrderId,error);
                    failureDetails.push(warrantyDatas[d]);
                }
            }

            log.debug('successDetails=='+successDetails.length,successDetails[0]);
            log.debug('failureDetails=='+failureDetails.length,failureDetails[0]);

            let response = {
                status:1,
                message:'success',
                details:{
                    success_warranty_updates:successDetails,
                    failure_warranty_updates:failureDetails
                }
            };

            log.debug('response==',response);

            return response;

        } catch (error) {
            log.error('Main Exception',error);
            return {
                status:0,
                message:'fail',
                details:{
                    error:error.name,
                    message:error.message
                }
            }
        }
    }

    //function to get the warranty details based on So#
    const getAllWarrantyRecordDetails = (soId) =>{
        try {
            const customrecord_warrantySearchObj = search.create({
                type: "customrecord_warranty",
                filters:
                [
                    ["isinactive","is","F"], 
                    "AND", 
                    ["custrecord_warranty_sales_order","anyof",soId]
                ],
                columns:
                [
                   search.createColumn({
                      name: "id",
                      sort: search.Sort.DESC,
                      label: "ID"
                   }),
                   search.createColumn({name: "custrecord_warranty_item", label: "Warranty Item"}),
                   search.createColumn({name: "custrecord_original_order_line_item", label: "ORIGINAL ORDER LINE ITEM"}),
                   search.createColumn({name: "custrecord_warranty_sales_order", label: "Sales Order"}),
                   search.createColumn({name: "custrecord_synced_salesforce", label: "Synced to Salesforce"})
                ]
            });
            let searchResultCount = customrecord_warrantySearchObj.runPaged().count;
            log.debug("Warranty Data For SO#"+soId,searchResultCount);
            const data = [];let line = Number(0);
            customrecord_warrantySearchObj.run().each(function(result){
                data.push({
                    original_item_id:result.getValue('custrecord_original_order_line_item'),
                    warranty_item_id:result.getValue('custrecord_warranty_item'),
                    sales_order_id:result.getValue('custrecord_warranty_sales_order'),
                    rec_id:result.id
                });
                line++;
                return true;
            });
            return data;
        } catch (error) {
            log.error('Error : In Get Warranty Details For Item',error);
            return [];
        }
    }

    return {
        post: updateSalesForceStatusOnWarrantyRecord
    }
});

//paylaod
/* {
    "limit": 50,
    "warrantyData": [
        {
            "transactionStatus": "errored",
            "salesOrderId": 9702582,
            "salesOrderTransactionId": "SO196095",
            "otherRefNum": 1000748085,
            "externalId": 1000748085,
            "createdDate": "08/28/2023",
            "warranty": [
                {
                    "line": 1,
                    "id": "19", //warranty rec id
                    "transactionStatus": "success",
                    "syncedToSalesforce": true
                },
                {
                    "line": 2,
                    "id": "20",
                    "transactionStatus": "failed",
                    "syncedToSalesforce": false,
                    "errorDetails": "transaction failed for xxx reason"
                }
            ]
        }
    ]
}*/