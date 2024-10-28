/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet
 * Script Name : Tonal Rst Update Extend Detail
 * File Name   : Tonal_Rst_Update_Extend_Detail.js
 * Description : This script is used for update the contractId, leadtoken on Sales Order. Invoked from MuleSoft.
 * Created On  : 30/10/2023
 * Modification Details:  
 *
 ************************************************************/
define(["N/search", "N/record"], (search, record) => {
    const updateExtendDetailsOnOrder = (context) => {
        try {
            //validate the mandatory paylaod attribute
            let payload = context;
            log.debug('payload==', payload);
            let type = payload.type;
            log.debug('type==', type);
            if (!type) {
                return returnResponse('fail', 'INVALID_PAYLOAD', 'Please add type to process Extend data.', '');
            }
            let data = payload.data;
            if (!data) {
                return returnResponse('fail', 'INVALID_PAYLOAD', 'Please add data to process Extend process.', '');
            }
            let dataCount = data.length;
            log.debug('dataCount==', dataCount);
            payload = data;
            if (!payload) {
                return returnResponse('fail', 'INVALID_PAYLOAD', {}, '');
            }
            if (dataCount == 0) {
                return returnResponse('fail', 'NO_DATA', 'Please provide sales order for Extend process.', '');
            }
            //get the so internal id which needs to pass under one saved search
            let nsSalesOrderIds = payload.map(a => a.transactionId);
            log.debug('nsSalesOrderIds==' + nsSalesOrderIds.length, nsSalesOrderIds);
            if (nsSalesOrderIds.length == 0) {
                return returnResponse('fail', 'NO_SALES_ORDER_IDS', 'No Sales Order Ids for the Extend process.', '')
            }
            //get the all so whcih needs to be updated for Extend contarct
            let allSoData = getAllSalesOrder(nsSalesOrderIds, type);
            log.debug('allSoData==' + allSoData.length, allSoData[0]);
            if (allSoData.length == 0) {
                return returnResponse('fail', 'NO_SALES_ORDER_FOUND_IN_NETSUITE', 'No sales order avilable in NS for Extend update.', '');
            }
            //filter all the sales order from NS and payload data and update the details on sales order
            let successData = [], failData = [];
            for (let i = 0; i < payload.length; i++) {
                let index = allSoData.findIndex(function (obj) {
                    return obj.ns_external_id == payload[i].transactionId;
                });
                let status = payload[i].status;
                if (index != -1 && status.toLowerCase() == 'success') {
                    let fieldValues;
                    if (type == 'Lead') {
                        fieldValues = {
                            custbody_extend_lead_token: payload[i].leadToken
                        }
                    }
                    if (type == 'Contract' || type == 'Lead Conversion') {
                        fieldValues = {
                            custbody_extended_contract_id: payload[i].contractId
                        };
                    }
                    let id = record.submitFields({
                        type: 'salesorder',
                        id: allSoData[index].ns_sales_order_id,
                        values: fieldValues
                    });
                    if (id) {
                        successData.push(allSoData[index]);
                    }
                }
                else if (index != -1 && status.toLowerCase() == 'fail') {
                    let id = record.submitFields({
                        type: 'salesorder',
                        id: allSoData[index].ns_sales_order_id,
                        values: {
                            custbody_extend_errored: true
                        }
                    });
                    if (id) {
                        failData.push(payload[i]);
                    }
                }
            }
            log.debug('successData==', successData.length, successData[0]);
            log.debug('failData==' + failData.length, failData[0]);
            return returnResponse('success', '', '', { success_data: successData, fail_data: failData });
        } catch (error) {
            log.error('Main Exception', error);
            return returnResponse('fail', error.name, error.message, '');
        }
    }
    //function to return the response
    const returnResponse = (message, error, errorMessage, data) => {
        let responseObj = { details: [] };
        if (message == 'fail') {
            let obj = {
                error: error,
                message: errorMessage
            }
            responseObj.status = 0;
            responseObj.message = message;
            responseObj.details[0] = obj;
        }
        if (message == 'success') {
            responseObj.status = 1;
            responseObj.message = message;
            responseObj.details[0] = data;
        }
        return responseObj;
    }
    //function to get the all sales order for extend contract update
    const getAllSalesOrder = (soIds, type) => {
        try {
            let filterArray = [];
            filterArray.push(["type", "anyof", "SalesOrd"]);
            filterArray.push("AND");
            filterArray.push(["mainline", "is", "T"]);
            filterArray.push("AND");
            filterArray.push(["externalid", "anyof", soIds]);
            filterArray.push("AND");
            filterArray.push(["custbody_extend_errored", "is", "F"]);
            if (type == 'Lead') {
                filterArray.push("AND");
                filterArray.push(["custbody_extend_lead_token", "isempty", ""]);
            }
            if (type == 'Contract' || type == 'Lead Conversion') {
                filterArray.push("AND");
                filterArray.push(["custbody_extended_contract_id", "isempty", ""]);
            }
            let salesorderSearchObj = search.create({
                type: "salesorder",
                filters: filterArray,
                columns:
                [
                    search.createColumn({ name: "tranid", label: "Document Number" }),
                    search.createColumn({ name: "internalid", label: "Internal ID" }),
                    search.createColumn({ name: "externalid", label: "External ID" })
                ]
            });
            let searchResultCount = salesorderSearchObj.runPaged().count;
            log.debug("Sales Order Count For Extend Contract Update", searchResultCount);
            let data = [];
            salesorderSearchObj.run().each(function (result) {
                data.push({ ns_sales_order_id: result.id, document_number: result.getValue('tranid'), ns_external_id: result.getValue('externalid'), type: type })
                return true;
            });
            return data;
        } catch (error) {
            log.error('Error : In Get All Sales Order', error);
            return [];
        }
    }
    return {
        post: updateExtendDetailsOnOrder
    }
});
/**
* Payload
* ==========
* {
*  "type":"lead/contract/leadConversion",
*  "data":[
*       {
*           "transactionId":12345,
*           "contractId":"4f470072-445b-40bb-9de9-bb1c7a60649b",
*           "status":"success/fail"
*       },
*       {
*           "transactionId":2222,
*           "contractId":"4f470072-445b-40bb-9de9-bb1c7a60649b",
*           "status":"success/fail"
*       }
*  ]  
* }  
*/