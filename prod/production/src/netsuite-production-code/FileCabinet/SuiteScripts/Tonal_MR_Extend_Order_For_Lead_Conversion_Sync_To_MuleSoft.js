/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR Extend Order For Lead Conversion Sync To MuleSoft
 * File Name   : Tonal_MR_Extend_Order_For_Lead_Conversion_Sync_To_MuleSoft.js
 * Description : This script is used for sync Extend Order for Lead Conversion to MuleSoft by taking search as input
 * Created On  : 26/10/2023
 * Modification Details:  
 ************************************************************/
/**
 * Update History
 * Version          Date            By              Requested By                Description
 * V1               16/11/2023      Vikash          Joanna                      Modification as per the jira ticket [ES-3133]
 * V2               08/12/2023      Vikash          Joanna                      Modification for the send transactionId parameter of Extend STandalone order
 * V3               04/04/2024      Vikash          Joanna                      Modification as per the jira ticket [ES-3445]
 */
define(
    [
        "N/runtime",
        "N/search",
        "N/record",
        "N/https",
        "N/file",
        "N/log"
    ], (runtime, search, record, https, file, log) => {

    //stage to get the search data for Extend order for contract
    const getInputData = () => {
        try {
            let scriptObj = runtime.getCurrentScript();
            let ssId = scriptObj.getParameter('custscript_extend_order_4_lead_conversn');
            let fourYearExtendItem = scriptObj.getParameter('custscript_4yrs_extend_item');
            let fiveYearExtendItem = scriptObj.getParameter('custscript_5yrs_extend_item');
            let storeId = scriptObj.getParameter('custscript_extend_storess_id');
            log.debug('ssId==' + ssId, 'storeId==' + storeId);
            log.debug('fourYearExtendItem==' + fourYearExtendItem, 'fiveYearExtendItem==' + fiveYearExtendItem);

            if (!ssId || !fourYearExtendItem || !fiveYearExtendItem || !storeId) {
                return [];
            }

            let searchObj = search.load({
                id: ssId
            })

            //load the search and get all the data
            let resultSet = searchObj.run();

            // now take the first portion of data.
            let currentRange = resultSet.getRange({
                start: 0,
                end: 1000
            });

            let i = 0;  // iterator for all search results
            let j = 0;  // iterator for current result range 0..999

            let data = [], itemID = '';
            while (j < currentRange.length) {

                // take the result row
                let result = currentRange[j];
                let itemId = result.getValue('item');
                let tranDate = result.getValue('trandate');
                let tranDateSplit = tranDate.split('/');
                tranDate = tranDateSplit[2] + '-' + tranDateSplit[0] + '-' + tranDateSplit[1];
                // log.debug('tranDate==',tranDate);

                let originalSalesOrder = getSalesOrder(result.getValue('internalid'),result.getValue('custbody_extend_lead_token'));

                log.debug('originalSalesOrder=='+originalSalesOrder.length,originalSalesOrder);

                if(originalSalesOrder.length > 0){
                    let originalSalesOrderStatus = originalSalesOrder[0].salesOrderStatus;
                    if(originalSalesOrderStatus == 'pendingBilling' || originalSalesOrderStatus == 'fullyBilled' || originalSalesOrderStatus=='closed'){

                        let payload = {
                            "currency": result.getText('currency'),
                            "customer": {
                                "email": result.getValue('email'),
                                "name": result.getValue({name: "formulatext",formula: "NVL2({customer.firstname}, CONCAT(CONCAT({customer.firstname}, ' '), {customer.lastname}), {customer.companyname})"}),/* result.getText('entity'), */
                                "phone": result.getValue({ name: "phone", join: "customerMain" }),
                                "locale": "en-US",
                                "billingAddress": {
                                    "address1": result.getValue('billaddress1'),
                                    "city": result.getValue('billcity'),
                                    "country": result.getValue('billcountrycode'),
                                    "postalCode": result.getValue('billzip'),
                                    "province": result.getValue('billstate'),
                                    "countryCode": result.getValue('billcountrycode')
                                },
                                "shippingAddress": {
                                    "address1": result.getValue('shipaddress1'),
                                    "city": result.getValue('shipcity'),
                                    "country": result.getValue('shipcountrycode'),
                                    "postalCode": result.getValue('shipzip'),
                                    "province": result.getValue('shipstate'),
                                    "countryCode": result.getValue('shipcountrycode')
                                }
                            },
                            "lineItems": [
                                {
                                    "lineItemTransactionId": Number(result.getValue('line')),
                                    "leadToken": result.getValue('custbody_extend_lead_token'),
                                    "plan": {}
                                }
                            ],
                            "storeId": storeId,
                            "transactionId": /* originalSalesOrder[0].salesOrderExternalid */result.getValue('externalid')
                        }
        
                        let index = data.findIndex(function (obj) {
                            return obj.transactionId == /* originalSalesOrder[0].salesOrderExternalid */result.getValue('externalid');
                        });
                        log.debug("index : " + index);
        
                        if (index == -1) {
                            data.push(payload);
                            itemID = result.getValue({ name: "internalid", join: "item" });
                            log.debug("itemID : " + itemID);
                            let planObj = {};
                            if (itemId == fourYearExtendItem) {
                                log.debug("Inside 4 year if : " + fourYearExtendItem);
                                planObj.id = 'A2-SGFIT-4y',
                                planObj.purchasePrice = Number(parseFloat(result.getValue('amount')).toFixed(2)) * 100,
                                //planObj.covered_product_id = itemID;
                                itemID = '';
                            }
                            else if (itemId == fiveYearExtendItem) {
                                log.debug("Inside 5 year if : " + fiveYearExtendItem);
                                planObj.id = 'A2-SGFIT-5y',
                                planObj.purchasePrice = Number(parseFloat(result.getValue('amount')).toFixed(2)) * 100,
                                //planObj.covered_product_id = itemID;
                                itemID = '';
                            }
                            data[data.length - 1].lineItems[0].plan = planObj;
                        }
                        else {
                            // do nothing
                        }

                    }
                }

                // finally:
                i++; j++;
                if (j == 1000) {   // check if it reaches 1000
                    j = 0;          // reset j an reload the next portion
                    currentRange = resultSet.getRange({
                        start: i,
                        end: i + 1000
                    });
                }
            }

            log.debug('data==' + data.length, data[0]);
            return data;

        } catch (error) {
            log.error('Error : In Get Input Stage', error);
            return [];
        }
    }

    //stage to form the Extend payload
    const reduce = (context) => {
        try {
            // log.debug('reduceContext==',context);
            let data = JSON.parse(context.values[0]);
            let values = data;
            // log.debug('values==',JSON.stringify(values));
            context.write({ key: values.transactionId, value: { success: true, extend_leadconversion_data: values } });
        } catch (error) {
            log.error('Error : In Reduce Stage', error);
            context.write({ key: values.transactionId, value: { success: false, extend_leadconversion_data: {} } });
        }
    }

    //stage to get the extend payload data, configuration record and sync to MuleSoft
    const summarize = (summary) => {
        try {
            let extendedData = [], failedData = [];
            summary.output.iterator().each(function (key, value) {
                /* log.debug({
                    title: 'Extended Contract',
                    details: 'key: ' + key + ' / value: ' + value
                }); */

                const data = JSON.parse(value);
                if (data.success == true) {
                    extendedData.push(data.extend_leadconversion_data);
                }
                else if (data.success == false) {
                    failedData.push({ extend_order_id: key, data: data.extend_leadconversion_data });
                }
                return true;
            });

            log.debug('extendedData==' + extendedData.length, extendedData[0]);
            log.debug('failedData==' + failedData.length, failedData);

            //get configuration record
            let globalConfiguration = getGlobalConfiguration('MuleSoft-Extend');
            log.debug('globalConfiguration==' + globalConfiguration.length, globalConfiguration);
            if (globalConfiguration.length == 0) {
                log.debug('NOT_SYNC_TO_MULESOFT', 'GLOBAL_CONFIG_MISSING');
                return;
            }

            //chunk the data per api call
            if (extendedData.length > 0) {
                //make 50 count of payload for one api call
                let chunkData = makeArrayDataChunks(extendedData);
                log.debug('chunkDatacount==', chunkData.length);
                if (chunkData.length > 0) {
                    for (var ci in chunkData) {
                        //store JSON in file for testing
                        /* let jsonFileObj = file.create({
                            name: 'Lead Conversion Payload - '+'.json',
                            fileType: file.Type.JSON,
                            contents: JSON.stringify(chunkData[ci]),
                            folder: -15,
                            encoding: file.Encoding.UTF8
                        });
                        

                        let fileId = jsonFileObj.save();
                        log.debug('fileId==',fileId); */
                        //make mulesoft api call 
                        syncExtendedLeadConversionDataToMuleSoft(chunkData[ci], globalConfiguration);
                    }
                }
            }

        } catch (error) {
            log.error('Errro : In Summarize', error);
        }
    }

    //function to make chunks of array
    const makeArrayDataChunks = (dataArray) => {
        try {
            let perChunk = 50 // items per chunk(IN SB 50,FOR PROD 50)    

            let inputArray = dataArray//;['a','b','c','d','e']

            let result = inputArray.reduce(function (resultArray, item, index) {
                let chunkIndex = Math.floor(index / perChunk);

                if (!resultArray[chunkIndex]) {
                    resultArray[chunkIndex] = []; // start a new chunk
                }

                resultArray[chunkIndex].push(item);

                return resultArray;
            }, [])

            // log.debug('chunkresult==',result); // result: [['a','b'], ['c','d'], ['e']]
            return result;
        } catch (error) {
            log.error('Error : In Make Array Data Chunks', error);
            return [];
        }
    }

    //function to get the global configuration details
    const getGlobalConfiguration = (thridPartyAppName) => {
        try {
            const customrecord_tnl_global_configuartionSearchObj = search.create({
                type: "customrecord_integration_configuration",
                filters:
                [
                    ["isinactive", "is", "F"],
                    "AND",
                    ["name", "is", thridPartyAppName]
                ],
                columns:
                [
                    search.createColumn({
                        name: "name",
                        sort: search.Sort.ASC,
                        label: "Name"
                    }),
                    search.createColumn({ name: "custrecord_tnl_ms_user_name", label: "MuleSoft User Name" }),
                    search.createColumn({ name: "custrecord_tnl_ms_password", label: "MuleSoft Password" }),
                    search.createColumn({ name: "custrecord_tnl_ms_ms_auth_token", label: "MuleSoft Auth Token" }),
                    search.createColumn({ name: "custrecord_tnl_ms_api_url", label: "MULESOFT LEAD CONVERSION API URL" })
                ]
            });
            let searchResultCount = customrecord_tnl_global_configuartionSearchObj.runPaged().count;
            log.debug("GlobalConfiguration Count", searchResultCount);
            const configurationDetails = [];
            customrecord_tnl_global_configuartionSearchObj.run().each(function (result) {
                configurationDetails.push({
                    gc_rec_id: result.id,
                    app_name: result.getValue('name'),
                    app_user_name: result.getValue('custrecord_tnl_ms_user_name'),
                    app_password: result.getValue('custrecord_tnl_ms_password'),
                    app_auth_token: result.getValue('custrecord_tnl_ms_ms_auth_token'),
                    app_extend_lead_conversion_api_url: result.getValue('custrecord_tnl_ms_api_url')
                });
                return true;
            });
            return configurationDetails;
        } catch (error) {
            log.error('Error : In Get Global Configuration', error);
            return [];
        }
    }

    //function to sync the data to MuleSoft
    const syncExtendedLeadConversionDataToMuleSoft = (payloadObj, globalConfiguration) => {
        try {
            log.debug('POST OPERATION', 'RUNNING');
            let request = https.post({
                body: JSON.stringify(payloadObj),
                url: globalConfiguration[0].app_extend_lead_conversion_api_url,
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "*/*",
                    'Authorization': 'Basic ' + globalConfiguration[0].app_auth_token
                }
            });

            let responseCode = request.code;
            let responseBody = request.body;

            log.debug('responseCode==' + responseCode, 'responseBody==' + responseBody);

            if (responseCode == 200) {
                log.debug('EXTEND_ORDER_PUSHED_IN_MULESOFT', "SUCCESSFULLY");
            }
            else {
                log.debug('EXTEND_ORDER_PUSHED_IN_MULESOFT', "UNSUCCESSFULLY");
            }
        } catch (error) {
            log.error('Error : In Sync Extend Contract Data In MuleSoft', error);
        }
    }

    //function to get the original sales order
    const getSalesOrder = (internalId, extendLeadtoken) => {
        try {
            var salesorderSearchObj = search.create({
                type: "salesorder",
                filters:
                [
                    ["type","anyof","SalesOrd"], 
                    "AND", 
                    ["mainline","is","T"],
                    "AND",
                    ["custbody_extend_lead_token","is",extendLeadtoken], 
                    "AND", 
                    ["internalidnumber", "notequalto",Number(internalId)]
                ],
                columns:
                [
                    search.createColumn({name: "tranid", label: "Document Number"}),
                    search.createColumn({name: "internalid", label: "Internal ID"}),
                    search.createColumn({name: "custbody_extend_lead_token", label: "Lead Token"}),
                    search.createColumn({name: "statusref", label: "Status"}),
                    search.createColumn({name: "externalid", label: "External ID"})
                ]
            });
            var searchResultCount = salesorderSearchObj.runPaged().count;
            log.debug("Original Sales Order Count",searchResultCount);
            let data = [];
            salesorderSearchObj.run().each(function(result){
                data.push({salesOrderInternalid:result.id,documentNumber:result.getValue('tranid'),leadToken:result.getValue('custbody_extend_lead_token'),salesOrderStatus:result.getValue('statusref'),salesOrderExternalid:result.getValue('externalid')});
                return true;
            });
            return data;
        } catch (error) {
            log.error('Error : In Get Original Sales Order',error);
            return [];
        }
    }

    return {
        getInputData: getInputData,
        reduce: reduce,
        summarize: summarize
    }
});