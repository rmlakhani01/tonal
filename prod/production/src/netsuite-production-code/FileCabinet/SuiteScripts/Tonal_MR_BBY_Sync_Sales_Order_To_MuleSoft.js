/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR BBY Sync Sales Order To MuleSoft
 * File Name   : Tonal_MR_BBY_Sync_Sales_Order_To_MuleSoft.js
 * Description : This script is used for sync BBY orders to MuleSoft
 * Created On  : 27/11/2023
 * Modification Details: 
 * ***********************************************************/
/**
 * Update History       
 * Version         Date             By              Requested By                    Description
 * V1              04/04/2024       Vikash          Joanna                          Modification as per the jira ticket [ES-3445]
 */
let record,search,https,runtime;
define(["N/record","N/search","N/https","N/runtime"],main);
function main (recordModule,searchModule,httpsModule,runtimeModule) {

    record = recordModule;
    search = searchModule;
    https = httpsModule;
    runtime = runtimeModule;

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
}

//function to get the search data from script parameter
function getInputData() {
    try {
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_bby_data_ms_sync');
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

//function to form the MS payload
const map = (context) => {
    try {
        let data = JSON.parse(context.value);
        let recId = JSON.parse(context.key);
        let payloadObj = getSOWarrantyPayload(recId);
        if(payloadObj != false){
            context.write({key:recId,value:{status:true,payload:payloadObj}});
        }
        else{
            context.write({key:recId,value:{status:false,payload:''}});
        }
    } catch (error) {
        log.error('Error : In Map Stage',error);
        context.write({key:recId,value:{status:false,error:error.message,payload:''}});
    }
}

const reduce = (context) => {
    try {
        let data = JSON.parse(context.values[0]);
        let recId = JSON.parse(context.key);
        context.write({key:recId,value:data});
    } catch (error) {
        log.error('Error : In Reduce Stage',error);
        context.write({key:recId,value:{status:false,error:error.message,payload:''}});
    }
}

//function to sync the data to MS
const summarize = (summary) => {
    try {
        const soIds = [], payloadData = [];
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'BBY Order Details',
                details: 'key: ' + key + ' / value: ' + value
            }); */

            const data = JSON.parse(value);

            if (data.status == true) {
                soIds.push(key);
                payloadData.push(data.payload);
            }
            return true;
        });

        log.debug('soIds==' + soIds.length, soIds);
        if (soIds.length > 0) {
            globalConfiguration = getGlobalConfiguration('MuleSoft-Best-Buy-Orders');
            if (globalConfiguration.length == 0) {
                log.debug('NOT_SYNC_TO_MULESOFT', 'GLOBAL_CONFIG_MISSING');
                return;
            }

            log.debug('payloadData==' + payloadData.length, payloadData[0]);
            if (payloadData.length > 0) {
                //make 50 count of payload for one api call
                let chunkData = makeArrayDataChunks(payloadData);
                log.debug('chunkDatacount==', chunkData.length);
                if (chunkData.length > 0) {
                    for (var ci in chunkData) {
                        try {
                            syncBBYSalesOrderToMuleSoft(chunkData[ci], globalConfiguration);
                        } catch (error) {
                            log.debug('Error : While Syncing Data To MS ', error);
                        }
                    }
                }
            }
        }
    } catch (error) {
        log.error('Error : In Summarize',error);
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
                    search.createColumn({ name: "custrecord_tnl_ms_api_url", label: "MULESOFT BBY ORDER API URL" })
                ]
        });
        let searchResultCount = customrecord_tnl_global_configurationSearchObj.runPaged().count;
        log.debug("GlobalConfiguration Count", searchResultCount);
        const configurationDetails = [];
        customrecord_tnl_global_configurationSearchObj.run().each(function (result) {
            configurationDetails.push({
                gc_rec_id: result.id,
                app_name: result.getValue('name'),
                app_user_name: result.getValue('custrecord_tnl_ms_user_name'),
                app_password: result.getValue('custrecord_tnl_ms_password'),
                app_auth_token: result.getValue('custrecord_tnl_ms_ms_auth_token'),
                app_bby_order_api_url: result.getValue('custrecord_tnl_ms_api_url')
            });
            return true;
        });
        return configurationDetails;
    } catch (error) {
        log.error('Error : In Get Global Configuration', error);
        return [];
    }
}

//function to form the mulesoft payload
const getSOWarrantyPayload = (soId) => {
    try {
        //load the so
        const soObj = record.load({
            type: record.Type.SALES_ORDER,
            id: soId,
            isDynamic: true
        });

        //get the header information and line information
        let nsCustomerId = soObj.getValue('entity');
        const customerObj = search.lookupFields({
            type: search.Type.CUSTOMER,
            id: nsCustomerId,
            columns: ['entityid', 'isperson', 'firstname', 'middlename', 'lastname', 'companyname', 'email', 'phone', 'datecreated', 'externalid']
        });

        log.debug('customerObj==', customerObj);

        let isIndividual = customerObj.isperson;
        // log.debug('isIndividual==',isIndividual);
        if (isIndividual == true) {
            let customername = customerObj.firstname + ' ' + customerObj.midname + ' ' + customerObj.lastname;
        }
        else {
            let customername = customerObj.companyname
        }

        let customerType = soObj.getText('custbody_customer_type');
        let customerCategory = soObj.getText('custbody_customer_category');
        // log.debug('customerType=='+customerType,'customerCategory=='+customerCategory);

        let wocommerceOrderid = soObj.getValue('otherrefnum');

        let orderStatus = soObj.getValue('statusRef');

        let exportToMuleSoft = soObj.getValue('custbody_tnl_so_export_to_mulesoft');

        let soLines = soObj.getLineCount({
            sublistId: 'item'
        });

        const itemObj = [];
        for (let l = 0; l < soLines; l++) {
            let itemId = soObj.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: l
            });

            let itemName = soObj.getSublistText({
                sublistId: 'item',
                fieldId: 'item',
                line: l
            });

            let itemRate = soObj.getSublistValue({
                sublistId: 'item',
                fieldId: 'rate',
                line: l
            });

            let itemLine = soObj.getSublistValue({
                sublistId: 'item',
                fieldId: 'line',
                line: l
            });

            let itemSku = search.lookupFields({
                type: 'item',
                id: itemId,
                columns: ['itemid']
            }).itemid;

            itemObj.push({
                line: Number(itemLine),
                price: itemRate || 0,
                id: itemId,
                number: itemSku,
                name: itemName,
                quantity: 1,
                serialNumbers: '',
            });
        }

        let shipAddessSubRecord = soObj.getSubrecord({
            fieldId: 'shippingaddress'
        });

        let s_lable = shipAddessSubRecord.getValue('label');
        let s_country = shipAddessSubRecord.getValue('country');
        let s_attention = shipAddessSubRecord.getValue('attention');
        let s_addresse = shipAddessSubRecord.getValue('addressee');
        let s_phone = shipAddessSubRecord.getValue('addrphone');
        let s_addr1 = shipAddessSubRecord.getValue('addr1');
        let s_addr2 = shipAddessSubRecord.getValue('addr2');
        let s_city = shipAddessSubRecord.getValue('city');
        let s_state = shipAddessSubRecord.getValue('state');
        let s_zip = shipAddessSubRecord.getValue('zip');

        let billingAddressSubRecor = soObj.getSubrecord({
            fieldId: 'billingaddress'
        });

        let b_lable = billingAddressSubRecor.getValue('label');
        let b_country = billingAddressSubRecor.getValue('country');
        let b_attention = billingAddressSubRecor.getValue('attention');
        let b_addresse = billingAddressSubRecor.getValue('addressee');
        let b_phone = billingAddressSubRecor.getValue('addrphone');
        let b_addr1 = billingAddressSubRecor.getValue('addr1');
        let b_addr2 = billingAddressSubRecor.getValue('addr2');
        let b_city = billingAddressSubRecor.getValue('city');
        let b_state = billingAddressSubRecor.getValue('state');
        let b_zip = billingAddressSubRecor.getValue('zip');

        let subtotal = soObj.getValue('subtotal') || 0.00;
        let discount = soObj.getValue('discounttotal') || 0.00;
        let tax = soObj.getValue('taxtotal') || 0.00;
        let total = soObj.getValue('total') || 0.00;

        let payloadObj = {
            salesOrderId: soId,
            createdDate:soObj.getValue('createddate'),
            externalId: wocommerceOrderid,
            orderStatus: orderStatus,
            exportToMulesoft:exportToMuleSoft,
            customerType: customerType,
            customerCategory: customerCategory, 
            customer: {
                dateCreated: customerObj.datecreated,
                email: customerObj.email,
                externalId: customerObj.externalid[0].value,
                id: nsCustomerId,
                phone: customerObj.phone
            },
            billingAddress: {
                name: customerObj.firstname + ' ' + customerObj.lastname,
                addr1: b_addr1,
                addr2: b_addr2,
                city: b_city,
                state: b_state,
                country: b_country,
                zip: b_zip,
                attention: b_attention,
                phone: b_phone
            },
            shippingAddress: {
                name: customerObj.firstname + ' ' + customerObj.lastname,
                addr1: s_addr1,
                addr2: s_addr2,
                city: s_city,
                state: s_state,
                country: s_country,
                zip: s_zip,
                attention: s_attention,
                phone: s_phone
            },
           
            items: itemObj,
            amount: {
                subtotal: subtotal,
                discount: discount,
                tax: tax,
                total: total
            }
        }

        // log.debug('payloadObj==',JSON.stringify(payloadObj));
        return payloadObj;
    } catch (error) {
        log.error('Error : In Get BBY Payload', error);
        return false;
    }
}

//function to sync the data to MuleSoft
const syncBBYSalesOrderToMuleSoft = (payloadObj, globalConfiguration) => {
    try {
        log.debug('POST OPERATION', 'RUNNING');
        let request = https.post({
            body: JSON.stringify(payloadObj),
            url: globalConfiguration[0].app_bby_order_api_url,
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
            log.debug('BBY_ORDERS_PUSHED_IN_MULESOFT', "SUCCESSFULLY");
        }
        else {
            log.debug('BBY_ORDERS_PUSHED_IN_MULESOFT', "UNSUCCESSFULLY");
        }
    } catch (error) {
        log.error('Error : In Sync BBY SO Data In MuleSoft', error);
    }
}

//function to make chunks of array
const makeArrayDataChunks = (dataArray) => {
    try {
        let perChunk = 100 // items per chunk(IN SB 100,FOR PROD 100)    

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