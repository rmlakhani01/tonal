/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR Extend Order For Contract Sync To MuleSoft
 * File Name   : TTonal_MR_Extend_Order_For_Contract_Sync_To_MuleSoft.js
 * Description : This script is used for sync Extend Order for Contract to MuleSoft by taking search as input
 * Created On  : 25/10/2023
 * Modification Details:  
 ************************************************************/
/**
 * Update History
 * Version              Date                By                  Request By                  Description
 * V1                   16/11/2023          Vikash              Joanna                      Modification as per the jira ticket [ES-3131]
 * V2                   04/04/2024          Vikash              Joanna                      Modification as per the jira ticket [ES-3445]
 */
define(
    [
        "N/runtime",
        "N/search",
        "N/record",
        "N/https",
        "N/file"
    ], (runtime, search, record, https, file) => {

    //stage to get the search data for Extend order for contarct
    const getInputData = () => {
        try {
            let scriptObj = runtime.getCurrentScript();
            let ssId = scriptObj.getParameter('custscript_extend_order_4_contract');
            let fourYearExtendItem = scriptObj.getParameter('custscript_4yr_extend_item');
            let fiveYearExtendItem = scriptObj.getParameter('custscript_5yr_extend_item');
            let storeId = scriptObj.getParameter('custscript_extend_stores_id');
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

            let data = [],ifDate = '';
            while (j < currentRange.length) {
                
                // take the result row
                let result = currentRange[j];
                let itemId = result.getValue('item');   // ITEM INTERNAL ID
                let itemNumber = result.getValue({ name: "itemid", join: "item" });    // ITEM
                let tranDate = result.getValue('trandate');
                let tranDateSplit = tranDate.split('/');
                tranDate = tranDateSplit[2] + '-' + tranDateSplit[0] + '-' + tranDateSplit[1];
                // log.debug('tranDate==',tranDate);

                let index = data.findIndex(function (obj) {
                    return obj.transactionId == result.getValue('externalid');
                });

                if (index == -1) {
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
                                "lineItemTransactionId": null,
                                "product": {},
                                "quantity": null,
                                "plan": {}
                            }
                        ],
                        "storeId": storeId,
                        "transactionId": result.getValue('externalid')
                    }

                    //get the if date
                    let ifDetails = getSalesOrderIfDate(result.getValue('internalid'));
                    log.debug('ifDetails=='+ifDetails.length,ifDetails);
                    if(ifDetails.length > 0){
                        ifDate = new Date(ifDetails[0].itemFulfillmentDate).getTime();
                    }

                    // check if it's plan or product
                    if (itemId == fourYearExtendItem || itemId == fiveYearExtendItem) {
                        payload.lineItems[0].plan.id = itemId == fourYearExtendItem ? 'A2-SGFIT-4y' : 'A2-SGFIT-5y';
                        payload.lineItems[0].plan.purchasePrice = Number(parseFloat(result.getValue('amount')).toFixed(2)) * 100;
                        payload.lineItems[0].plan.purchaseDate = ifDate;
                    } else {
                        payload.lineItems[0].lineItemTransactionId = Number(result.getValue('line'));
                        payload.lineItems[0].product = {
                            "id": itemNumber,
                            "title": result.getValue({ name: "displayname", join: "item" }),
                            "category": "Tonal",
                            "listPrice": Number(parseFloat(result.getValue('amount') * 100).toFixed(2)),
                            "purchasePrice": Number(parseFloat(result.getValue('amount') * 100).toFixed(2)),
                            "purchaseDate": ifDate/* new Date(tranDate).getTime() */
                        };
                        payload.lineItems[0].quantity = result.getValue('quantity') || 1;
                        payload.lineItems[0].plan.covered_product_id = payload.lineItems[0].product.id;
                    }

                    data.push(payload);
                } else {
                    if (itemId == fourYearExtendItem || itemId == fiveYearExtendItem) {
                        data[index].lineItems[0].plan = {
                            "id": itemId == fourYearExtendItem ? 'A2-SGFIT-4y' : 'A2-SGFIT-5y',
                            "purchasePrice": Number(parseFloat(result.getValue('amount')).toFixed(2)) * 100,
                            "covered_product_id": data[index].lineItems[0].product.id,
                            "purchaseDate":ifDate
                        };
                        ifDate = '';
                    } else {
                        data[index].lineItems[0].lineItemTransactionId = Number(result.getValue('line'));
                        data[index].lineItems[0].product = {
                            "id": itemNumber,
                            "title": result.getValue({ name: "displayname", join: "item" }),
                            "category": "Tonal",
                            "listPrice": Number(parseFloat(result.getValue('amount') * 100).toFixed(2)),
                            "purchasePrice": Number(parseFloat(result.getValue('amount') * 100).toFixed(2)),
                            "purchaseDate": ifDate/* new Date(tranDate).getTime() */
                        };
                        data[index].lineItems[0].quantity = result.getValue('quantity') || 1;
                        ifDate = '';
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
            context.write({ key: values.transactionId, value: { success: true, extend_contract_data: values } });
        } catch (error) {
            log.error('Error : In Reduce Stage', error);
            context.write({ key: values.transactionId, value: { success: false, extend_contract_data: {} } });
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
                    extendedData.push(data.extend_contract_data);
                }
                else if (data.success == false) {
                    failedData.push({ extend_order_id: key, data: data.extend_contract_data });
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
                        /*  let jsonFileObj = file.create({
                                name: 'Contract Payload - '+'.json',
                                fileType: file.Type.JSON,
                                contents: JSON.stringify(chunkData[ci]),
                                folder: -15,
                                encoding: file.Encoding.UTF8
                            });
                            
    
                            let fileId = jsonFileObj.save();
                            log.debug('fileId==',fileId); */
                        //make mulesoft api call 
                        syncExtendedContractDataToMuleSoft(chunkData[ci], globalConfiguration);
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
    const getGlobalConfiguration = (thirdPartyAppName) => {
        try {
            const customrecord_tnl_global_configurationSearchObj = search.create({
                type: "customrecord_integration_configuration",
                filters:
                    [
                        ["isinactive", "is", "F"],
                        "AND",
                        ["name", "is", thirdPartyAppName]
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
                        search.createColumn({ name: "custrecord_tnl_ms_api_url", label: "MULESOFT EXTEND CONTRACT API URL" })
                    ]
            });
            let searchResultCount = customrecord_tnl_global_configurationSearchObj.runPaged().count;
            log.debug("Global Configuration Count", searchResultCount);
            const configurationDetails = [];
            customrecord_tnl_global_configurationSearchObj.run().each(function (result) {
                configurationDetails.push({
                    gc_rec_id: result.id,
                    app_name: result.getValue('name'),
                    app_user_name: result.getValue('custrecord_tnl_ms_user_name'),
                    app_password: result.getValue('custrecord_tnl_ms_password'),
                    app_auth_token: result.getValue('custrecord_tnl_ms_ms_auth_token'),
                    app_extend_contract_api_url: result.getValue('custrecord_tnl_ms_api_url')
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
    const syncExtendedContractDataToMuleSoft = (payloadObj, globalConfiguration) => {
        try {
            log.debug('POST OPERATION', 'RUNNING');
            let request = https.post({
                body: JSON.stringify(payloadObj),
                url: globalConfiguration[0].app_extend_contract_api_url,
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

    //function to get the sales order IF date
    const getSalesOrderIfDate = (salesOrderInternalId) => {
        try {
            let itemfulfillmentSearchObj = search.create({
                type: "itemfulfillment",
                filters:
                [
                   ["type","anyof","ItemShip"], 
                   "AND", 
                   ["createdfrom","anyof",salesOrderInternalId], 
                   "AND", 
                   ["mainline","is","T"]
                ],
                columns:
                [
                   search.createColumn({
                      name: "trandate",
                      sort: search.Sort.DESC,
                      label: "Date"
                   }),
                   search.createColumn({name: "transactionnumber", label: "Transaction Number"}),
                   search.createColumn({name: "tranid", label: "Document Number"}),
                   search.createColumn({name: "createdfrom", label: "Created From"})
                ]
            });
            var searchResultCount = itemfulfillmentSearchObj.runPaged().count;
            log.debug("IF Count For SO#=="+salesOrderInternalId,searchResultCount);
            let ifData = [];
            itemfulfillmentSearchObj.run().each(function(result){
                let ifDate = result.getValue('trandate');
                let x = ifDate.split('/');
                ifData.push({itemFulfillmentInternalId:result.id,documentNumber:result.getValue('tranid'),itemFulfillmentDate:x[2] + '-' + x[0] + '-' + x[1]});
                return true;
            });
             
            return ifData;
        } catch (error) {
            log.error('Error : In Get Sales Order IF Date',error);
            return [];
        }
    }

    return {
        getInputData: getInputData,
        reduce: reduce,
        summarize: summarize
    }
});