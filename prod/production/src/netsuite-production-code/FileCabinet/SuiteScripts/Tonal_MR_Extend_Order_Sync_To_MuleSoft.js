/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR Extend Order Sync To MuleSoft
 * File Name   : Tonal_MR_Extend_Order_Sync_To_MuleSoft.js
 * Description : This script is used for sync Extend Order to MuleSoft by taking search as input
 * Created On  : 20/10/2023
 * Modification Details:  
 ************************************************************/
/**
 * Update History
 * Version              By              Date                Requested By                    Description
 * V1                   Vikash          23/10/2023                                          Modification for the as per jira ticket update [ES-3057]
 * V2                   Vikash          04/04/2024          Joanna                          Modification as per the jira ticket [ES-3445]
 */
define(
    [
        "N/runtime",
        "N/search",
        "N/record",
        "N/https",
        "N/file"
    ], (runtime,search,record,https,file) => {

    //stage to get the search data for Extend order
    const getInputData = () => {
        try {
            let scriptObj = runtime.getCurrentScript();
            let ssId = scriptObj.getParameter('custscript_extend_order');
            log.debug('ssId==',ssId);

            if(!ssId){
                return [];
            }

            return search.load({
                id: ssId
            });
        } catch (error) {
            log.error('Error : In Get Input Stage',error);
            return [];
        }
    }

    //stage to form the Extend payload
    const reduce = (context) => {
        try {
            let scriptObj = runtime.getCurrentScript();
            let storeId = scriptObj.getParameter('custscript_extend_store_id');
            // log.debug('reduceContext==',context);
            let data = JSON.parse(context.values[0]);
            let values = data.values;
            // log.debug('values==',JSON.stringify(values));
            let tranDate = values.trandate;
            let tranDateSplit = tranDate.split('/');
            tranDate = tranDateSplit[2]+'-'+tranDateSplit[0]+'-'+tranDateSplit[1];
            log.debug('tranDate==',tranDate);
            let payloadObj = {
                "currency": values.currency.text,
                "customer": {
                  "email": values.email,
                  "name": values.formulatext,//values.entity.text,
                  "phone": values['phone.customerMain'],
                  "locale": "en-US",
                  "billingAddress": {
                    "address1": values.billaddress1,
                    "city": values.billcity,
                    "country": values.billcountrycode,
                    "postalCode": values.billzip,
                    "province": values.billstate,
                    "countryCode": values.billcountrycode
                  },
                  "shippingAddress": {
                    "address1": values.shipaddress1,
                    "city": values.shipcity,
                    "country": values.shipcountrycode,
                    "postalCode": values.shipzip,
                    "province": values.shipstate,
                    "countryCode": values.shipcountrycode
                  }
                },
                "lineItems": [
                  {
                    "lineItemTransactionId": Number(values.line),
                    "product": {
                      "id": values.item.text,
                      "title": values['displayname.item'],
                      "category": "Tonal",//always hardcoded
                      "listPrice": Number(values.amount) * 100,
                      "purchasePrice": Number(values.amount) * 100,
                      "purchaseDate": new Date(tranDate).getTime()
                    },
                    "quantity": values.quantity
                  }
                ],
                "storeId": storeId,//fixed and came from script parameter
                "transactionId": values.externalid.value
            }
            // log.debug('payloadObj==',payloadObj);
            context.write({key:values.internalid.value,value:{success:true, extend_order_data:payloadObj}});
        } catch (error) {
            log.error('Error : In Reduce Satge',error);
            context.write({key:values.internalid.value,value:{success:false, extend_order_data:{}}});
        }
    }

    //stage to get the extend payload data, configuration record and sync to MuleSoft
    const summarize = (summary) => {
        try {
            let extendedData = [],failedData = [];
            summary.output.iterator().each(function (key, value) {
                /* log.debug({
                    title: 'Extended Order',
                    details: 'key: ' + key + ' / value: ' + value
                }); */

                const data = JSON.parse(value);
                if(data.success == true){
                    extendedData.push(data.extend_order_data);
                }
                else if(data.success == false){
                    failedData.push({extend_order_id:key,data:data.extend_order_data});
                }
                return true;
            });

            log.debug('extendedData=='+extendedData.length,extendedData[0]);
            log.debug('failedData=='+failedData.length,failedData);

            //get configuration record
            let globalConfiguration = getGlobalConfiguration('MuleSoft-Extend');
            log.debug('globalConfiguration=='+globalConfiguration.length,globalConfiguration);
            if(globalConfiguration.length == 0){
                log.debug('NOT_SYNC_TO_MULESOFT','GLOBAL_CONFIG_MISSING');
                return;
            }

            //chunk the data per api call
            if(extendedData.length > 0){
                //make 50 count of payload for one api call
                let chunkData = makeArrayDataChunks(extendedData);
                log.debug('chunkDatacount==',chunkData.length);
                if(chunkData.length > 0){
                    for(var ci in chunkData){
                        //store JSON in file for testing
                        /* let jsonFileObj = file.create({
                            name: 'Lead Payload - '+'.json',
                            fileType: file.Type.JSON,
                            contents: JSON.stringify(chunkData[ci]),
                            folder: -15,
                            encoding: file.Encoding.UTF8
                        });
                        

                        let fileId = jsonFileObj.save();
                        log.debug('fileId==',fileId); */
                        //make mulesoft api call 
                        syncExtendedOrderDataToMuleSoft(chunkData[ci],globalConfiguration);
                    }
                }
            }

        } catch (error) {
            log.error('Errro : In Summarize',error);
        }
    }

    //function to make chunks of array
    const makeArrayDataChunks = (dataArray) =>{
        try {
            let  perChunk = 50 // items per chunk(IN SB 50,FOR PROD 50)    

            let inputArray = dataArray//;['a','b','c','d','e']

            let result = inputArray.reduce(function(resultArray, item, index){ 
            let chunkIndex = Math.floor(index/perChunk);

                if(!resultArray[chunkIndex]) {
                    resultArray[chunkIndex] = []; // start a new chunk
                }

                resultArray[chunkIndex].push(item);

                return resultArray;
            }, [])

            // log.debug('chunkresult==',result); // result: [['a','b'], ['c','d'], ['e']]
            return result;
        } catch (error) {
            log.error('Error : In Make Array Data Chunks',error);
            return [];
        }
    }

    //function to get the global configuration details
    const getGlobalConfiguration = (thirdPartyAppName) =>{
        try {
            const customrecord_tnl_global_configurationSearchObj = search.create({
                type: "customrecord_integration_configuration",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["name","is",thirdPartyAppName]
                ],
                columns:
                [
                   search.createColumn({
                      name: "name",
                      sort: search.Sort.ASC,
                      label: "Name"
                   }),
                   search.createColumn({name: "custrecord_tnl_ms_user_name", label: "MuleSoft User Name"}),
                   search.createColumn({name: "custrecord_tnl_ms_password", label: "MuleSoft Password"}),
                   search.createColumn({name: "custrecord_tnl_ms_ms_auth_token", label: "MuleSoft Auth Token"}),
                   search.createColumn({name: "custrecord_tnl_ms_api_url", label: "MULESOFT EXTEND ORDER API URL"})
                ]
            });
            let searchResultCount = customrecord_tnl_global_configurationSearchObj.runPaged().count;
            log.debug("GlobalConfiguration Count",searchResultCount);
            const configurationDetails = [];
            customrecord_tnl_global_configurationSearchObj.run().each(function(result){
                configurationDetails.push({
                    gc_rec_id:result.id,
                    app_name:result.getValue('name'),
                    app_user_name:result.getValue('custrecord_tnl_ms_user_name'),
                    app_password:result.getValue('custrecord_tnl_ms_password'),
                    app_auth_token:result.getValue('custrecord_tnl_ms_ms_auth_token'),
                    app_extend_order_api_url:result.getValue('custrecord_tnl_ms_api_url')
                });
                return true;
            });
            return configurationDetails;
        } catch (error) {
            log.error('Error : In Get Integrations Configuration',error);
            return [];
        }
    }

    //function to sync the data to MuleSoft
    const syncExtendedOrderDataToMuleSoft = (payloadObj,globalConfiguration) =>{
        try {
            log.debug('POST OPERATION','RUNNING');
            let request = https.post({
                body: JSON.stringify(payloadObj),
                url: globalConfiguration[0].app_extend_order_api_url,
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "*/*",
                    'Authorization':'Basic '+globalConfiguration[0].app_auth_token
                }
            });

            let responseCode = request.code;
            let responseBody = request.body;

            log.debug('responseCode=='+responseCode,'responseBody=='+responseBody);

            if(responseCode == 200){
                log.debug('EXTEND_ORDER_PUSHED_IN_MULESOFT',"SUCCESSFULLY");
            }
            else{
                log.debug('EXTEND_ORDER_PUSHED_IN_MULESOFT',"UNSUCCESSFULLY");
            }
        } catch (error) {
            log.error('Error : In Sync Extend Order Data In MuleSoft',error);
        }
    }

    return {
        getInputData: getInputData,
        reduce: reduce,
        summarize: summarize
    }
});