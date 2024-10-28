/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR BBY Sales Order Warranty Sync To MS
 * File Name   : Tonal_MR_BBY_Sales_Order_Warranty_Sync_To_MS.js
 * Description : This script is used for sync BBY orders warranty details to MuleSoft
 * Created On  : 28/11/2023
 * Modification Details: 
 * ***********************************************************/
/**
 * Update History       
 * Version         Date             By              Requested By                    Description
 * V1              04/04/2024       Vikash          Joanna                          Modification as per the jira ticket [ES-3445]
 */
let runtime,search,https,record,format,moment;
define(["N/runtime","N/search","N/https","N/record","N/format","./moment.min.js"], main);
function main(runtimeModule,searchModule,httpsModule,recordModule,formatModule,momentModule) {

    runtime = runtimeModule;
    search = searchModule;
    https = httpsModule;
    record = recordModule;
    format = formatModule;
    moment = momentModule;

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
}

const getInputData = () => {
    try {
        //get the search data from the script parameters
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_bby_warranty_data');
        log.debug('ssId==', ssId);
        if (!ssId) {
            return [];
        }

        return search.load({
            id: ssId
        });

    } catch (error) {
        log.error('Error : In Get Input Stage');
        return [];
    }
}

const map = (context) => {
    try {

        // log.debug('mapContext==',context);
        let data = JSON.parse(context.value);
        let scriptObj = runtime.getCurrentScript();
        let fourYearExtendedWarrantyItem = scriptObj.getParameter('custscript_4yr_ext_bby_warr_item');
        let fiveYearExtendedWarrantyItem = scriptObj.getParameter('custscript_5yr_ext_bby_warr_item');
        // log.debug('fourYearExtendedWarrantyItem=='+fourYearExtendedWarrantyItem,'fiveYearExtendedWarrantyItem=='+fiveYearExtendedWarrantyItem);
        let soId = data.values['GROUP(internalid)'].value;
        let soDate = data.values['GROUP(trandate)'];
        log.debug('Processing For So#' + soId, 'soDate#' + soDate);//09/03/2023
        let x = soDate.split('/');
        let d = x[1];
        let m = x[0];
        let y = x[2];
        soDate = y + '-' + m + '-' + d;

        // log.debug('soDate==',soDate);

        const soObj1 = record.load({
            type: record.Type.SALES_ORDER,
            id: soId,
            isDynamic: true
        });

        let soUpdatedWithWarrantydetails = claculateWarrantyExpiration(soObj1, soDate, fourYearExtendedWarrantyItem, fiveYearExtendedWarrantyItem);
        // log.debug('soUpdatedWithWarrantydetails==',soUpdatedWithWarrantydetails);
        if (typeof (soUpdatedWithWarrantydetails) == 'object' && soUpdatedWithWarrantydetails.error != undefined) {
            log.debug('NOT_SYNC_TO_MULESOFT', 'ERROR_WHILE_UPDATING_DATES_ON_WARRANTY');
            context.write({ key: soId, value: { success: false } });
            return;
        }

        context.write({ key: soUpdatedWithWarrantydetails, value: { success: true } });

    } catch (error) {
        log.errro('Error : In Map Stage', error);
        context.write({ key: soId, value: { success: false } });
    }
}

const reduce = (context) => {
    try {

        // log.debug('reduceContext==',context);
        let data = JSON.parse(context.values[0]);
        let soId = JSON.parse(context.key);
        //get the warranty payload
        let warrantyPayload = getSOWarrantyPayload(soId.toString());
        if (warrantyPayload == false) {
            context.write({ key: soId, value: { success: false } });
            return;
        }

        context.write({ key: soId, value: { success: true, warranty_payload: warrantyPayload } });

    } catch (error) {
        log.error('Error : In Reduce Stage', error);
        context.write({ key: soId, value: { success: false } });
    }
}

const summarize = (summary) => {
    try {
        const soIds = [], payloadData = [];
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'BBY Warranty Updated For Order',
                details: 'key: ' + key + ' / value: ' + value
            }); */

            const data = JSON.parse(value);

            if (data.success == true) {
                soIds.push(key);
                payloadData.push(data.warranty_payload);
            }
            return true;
        });

        log.debug('soIds==' + soIds.length, soIds);
        if (soIds.length > 0) {
            globalConfiguration = getGlobalConfiguration('MuleSoft-Best-Buy-Warranty');
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
                            syncBBYSOWarrantyDataToMuleSoft(chunkData[ci], globalConfiguration);
                        } catch (error) {
                            log.debug('Error : While Syncing Data To MS ', error);
                        }
                    }
                }
            }
        }
    } catch (error) {
        log.error('Error : In Summarize Stage', error);
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
                    search.createColumn({ name: "custrecord_tnl_ms_api_url", label: "MULESOFT Best Buy Warranty ORDER API URL" })
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
                app_bby_warranty_order_api_url: result.getValue('custrecord_tnl_ms_api_url')
            });
            return true;
        });
        return configurationDetails;
    } catch (error) {
        log.error('Error : In Get Global Configuration', error);
        return [];
    }
}

//function to get the warranty details based on item as original item on warranty record
const getWarrantyDetailsForItem = (itemId, soId) => {
    try {
        const customrecord_warrantySearchObj = search.create({
            type: "customrecord_warranty",
            filters:
                [
                    ["isinactive", "is", "F"],
                    "AND",
                    ["custrecord_original_order_line_item", "anyof", itemId],
                    "AND",
                    ["custrecord_warranty_sales_order", "anyof", soId]
                ],
            columns:
                [
                    search.createColumn({ name: "id", sort: search.Sort.DESC, label: "ID" }),
                    search.createColumn({ name: "custrecord_warranty_item", label: "Warranty Item" }),
                    search.createColumn({ name: "custrecord_warranty_item_description", label: "Item Description" }),
                    search.createColumn({ name: "custrecord_warranty_serial_number", label: "Serial Number" }),
                    search.createColumn({ name: "custrecord_parts_expiration_date", label: "Parts Expiration Date" }),
                    search.createColumn({ name: "custrecord_labor_expiration_date", label: "Labor Expiration Date" }),
                    search.createColumn({ name: "custrecord_tos_version", label: "TOS Version" }),
                    search.createColumn({ name: "custrecord_warranty_status", label: "Warranty Status" }),
                    search.createColumn({ name: "custrecord_warranty_type", label: "Warranty Type" }),
                    search.createColumn({ name: "custrecord_synced_salesforce", label: "Synced to Salesforce" }),
                    search.createColumn({ name: "custrecord_warranty_activation_date", label: "Activation Date" })
                ]
        });
        let searchResultCount = customrecord_warrantySearchObj.runPaged().count;
        log.debug("Warranty Data For SO ITEM#" + soId, searchResultCount);
        const data = []; let line = Number(0);
        customrecord_warrantySearchObj.run().each(function (result) {
            let pExpDate = result.getValue('custrecord_parts_expiration_date');
            let x = pExpDate.split('/');
            pExpDate = x[2] + '-' + x[0] + '-' + x[1];
            let lExpDate = result.getValue('custrecord_labor_expiration_date');
            let y = lExpDate.split('/');
            lExpDate = y[2] + '-' + y[0] + '-' + y[1];
            let actDate = result.getValue('custrecord_warranty_activation_date');
            let z = actDate.split('/');
            actDate = z[2] + '-' + z[0] + '-' + z[1];

            data.push({
                "line": line,
                "id": result.getValue('id'),//warranty record internal id
                "number": result.getText('custrecord_warranty_item'),//item code
                "name": result.getValue('custrecord_warranty_item_description'),//item Description
                "serialNumbers": "",
                "startDate": actDate,//activation date
                "partsExpirationDate": pExpDate,
                "labourExpirationDate": lExpDate,
                "tosVersion": result.getText('custrecord_tos_version'),//string
                "status": result.getText('custrecord_warranty_status'),//string
                "warrantyType": result.getText('custrecord_warranty_type'),//string
                "syncedToSalesforce": result.getValue('custrecord_synced_salesforce')
            });
            line++;
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Warranty Details For Item', error);
        return [];
    }
}

//function to calculates dates for warranty record and update
const claculateWarrantyExpiration = (soObj, soDate, fourYearExtendedWarrantyItem, fiveYearExtendedWarrantyItem) => {
    try {
        let warrantyLineCount = soObj.getLineCount('recmachcustrecord_warranty_sales_order');
        //get the item then based on that set the other values
        let items = ['100-0001', '121-0006', '121-0007', '110-0018', '110-0017', '120-0010', '120-0013', '121-0005'];//these are fixed skus??
        //check so itemhavig any extended warranty item
        let warranty4yrItem = false, warranty4yrSOItem, warranty5yrItem = false, warranty5yrSOItem;
        for (let ex = 0; ex < soObj.getLineCount('item'); ex++) {
            let itemId = soObj.getSublistValue('item', 'item', ex);
            // log.debug('soItemId=='+itemId);
            if (itemId == fourYearExtendedWarrantyItem) {
                warranty4yrItem = true;
                warranty4yrSOItem = itemId; break;//added to terminate the unnecessary loop once match found
            }
            else if (itemId == fiveYearExtendedWarrantyItem) {
                warranty5yrItem = true;
                warranty5yrSOItem = itemId; break;
            }
        }
        // log.debug('warranty4yrItem=='+warranty4yrItem,'warranty4yrSOItem=='+warranty4yrSOItem);
        // log.debug('warranty5yrItem=='+warranty5yrItem,'warranty5yrSOItem=='+warranty5yrSOItem);

        for (let wl = 0; wl < warrantyLineCount; wl++) {
            try {
                let itemMatched = false;
                soObj.selectLine({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    line: wl
                });

                let itemId = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_item'
                });

                let itemObj = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['itemid']
                });
                // log.debug('itemObj==',itemObj);

                let itemSku = itemObj.itemid;

                let regularOrLegacy = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_tos_version'
                });//1 - Legacy, 2 - Regular
                let regularOrLegacyText = soObj.getCurrentSublistText({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_tos_version'
                });

                let warrantyType = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_type'
                });//1 - Standard, 2 - Extended, 3 - limited
                let warrantyTypeText = soObj.getCurrentSublistText({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_type'
                });

                let warrantyStatus = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_status'
                });//3 - Replaced, 4 - Repaired
                let warrantyStatusText = soObj.getCurrentSublistText({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_status'
                });
                // log.debug('warrantyStatus==',warrantyStatusText);


                //check the status if only pending activation then do the dates calculations, else no dates calculations
                if (warrantyStatus == 1) {

                    //standard(regular)
                    if (warrantyType == 1) {
                        //check sku
                        if (itemSku == '100-0001' || itemSku == '100-0002' || itemSku == '150-0016' ||itemSku ==
                        '100-0003') {//main item
                            //regular
                            if (regularOrLegacy == 2) {
                                //+2
                                let values = addYearInDateAndReturnText(soDate, 2);
                                if (values) {

                                    soObj.setCurrentSublistText({
                                        sublistId: 'recmachcustrecord_warranty_sales_order',
                                        fieldId: 'custrecord_parts_expiration_date',
                                        text: values
                                    });

                                    soObj.setCurrentSublistText({
                                        sublistId: 'recmachcustrecord_warranty_sales_order',
                                        fieldId: 'custrecord_labor_expiration_date',
                                        text: values
                                    });

                                    itemMatched = true;
                                }
                            }
                            //legacy
                            else if (regularOrLegacy == 1) {
                                //+1,+3
                                soObj.setCurrentSublistText({
                                    sublistId: 'recmachcustrecord_warranty_sales_order',
                                    fieldId: 'custrecord_parts_expiration_date',
                                    text: addYearInDateAndReturnText(soDate, 3)
                                });

                                soObj.setCurrentSublistText({
                                    sublistId: 'recmachcustrecord_warranty_sales_order',
                                    fieldId: 'custrecord_labor_expiration_date',
                                    text: addYearInDateAndReturnText(soDate, 1)
                                });

                                itemMatched = true;
                            }
                        }
                        else if (itemSku == '121-0006' || itemSku == '121-0006' || itemSku == '121-0007' || itemSku == '110-0018'
                            || itemSku == '110-0017' || itemSku == '120-0010' || itemSku == '120-0013' || itemSku == '121-0005') {//accesseries
                            //add 1 yr
                            let values = addYearInDateAndReturnText(soDate, 1);
                            if (values) {
                                soObj.setCurrentSublistText({
                                    sublistId: 'recmachcustrecord_warranty_sales_order',
                                    fieldId: 'custrecord_parts_expiration_date',
                                    text: values
                                });

                                soObj.setCurrentSublistText({
                                    sublistId: 'recmachcustrecord_warranty_sales_order',
                                    fieldId: 'custrecord_labor_expiration_date',
                                    text: values
                                });

                                itemMatched = true;
                            }
                        }
                    }
                    //extended
                    else if (warrantyType == 2) {
                        //set 4yr,5yr calculation
                        let values;
                        //4yr
                        if (warranty4yrItem == true) {
                            values = addYearInDateAndReturnText(soDate, 4);
                        }
                        //5yr
                        else if (warranty5yrItem == true) {
                            values = addYearInDateAndReturnText(soDate, 5);
                        }
                        if (values) {
                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_parts_expiration_date',
                                text: values
                            });

                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_labor_expiration_date',
                                text: values
                            });

                            itemMatched = true;
                        }
                    }
                    //limited
                    else if (warrantyType == 3) {
                        //+180days
                        let values = addDaysInDateAndReturnText(soDate, 180);
                        if (values) {
                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_parts_expiration_date',
                                text: values
                            });

                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_labor_expiration_date',
                                text: values
                            });

                            itemMatched = true;
                        }
                    }
                    //non of them
                    else {
                        log.debug('ITEM_NOT_MATCHED_FOR_DATES', itemSku);
                        itemMatched = false;
                    }

                    // log.debug('itemMatched==', itemMatched);

                    if (itemMatched == true) {
                        let x = soDate;
                        let y = x.split('-');
                        let d = y[1] + '/' + y[2] + '/' + y[0];
                        //set warranty activation date
                        soObj.setCurrentSublistText({
                            sublistId: 'recmachcustrecord_warranty_sales_order',
                            fieldId: 'custrecord_warranty_activation_date',
                            text: d
                        });

                        //set warranty status
                        soObj.setCurrentSublistValue({
                            sublistId: 'recmachcustrecord_warranty_sales_order',
                            fieldId: 'custrecord_warranty_status',
                            value: 2//activated
                        });

                        soObj.commitLine({
                            sublistId: 'recmachcustrecord_warranty_sales_order'
                        });

                        // log.debug('DATE_SET_FOR', itemSku);
                    }

                }

            } catch (error) {
                log.error('Error : While Processing Warranty Line ==', error);
            }
        }
        let soId = soObj.save();
        if (soId) {
            log.debug('SO#==' + soId, 'Updated With Warranty Details');
            return Number(soId);
        }
    } catch (error) {
        log.error('Error : In Calculating Warranty Expiration', error);
        return { error: error.name, message: error.message };
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
        let tarnId = soObj.getValue('tranid');
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

        let tranDate = soObj.getValue('trandate');
        let wocommerceOrderid = soObj.getValue('otherrefnum');
        let salesEffectiveDate = soObj.getValue('saleseffectivedate');

        let subsidiaryId = soObj.getValue('subsidiary');
        const subsidiaryObj = search.lookupFields({
            type: search.Type.SUBSIDIARY,
            id: subsidiaryId,
            columns: ['namenohierarchy']
        });
        let subSidiaryName = subsidiaryObj.namenohierarchy;

        let locationId = soObj.getValue('location');
        let locationName = '';
        if (locationId) {
            const locationObj = search.lookupFields({
                type: search.Type.LOCATION,
                id: locationId,
                columns: ['namenohierarchy']
            });
            locationName = locationObj.namenohierarchy;
        }

        let departmentId = soObj.getValue('department');
        let departmentName = '';
        if (departmentId) {
            const departmentObj = search.lookupFields({
                type: search.Type.DEPARTMENT,
                id: departmentId,
                columns: ['namenohierarchy']
            });
            departmentName = departmentObj.namenohierarchy;
        }

        let orderType = soObj.getValue('custbody_jaz_ordertype') || '';
        let orderTypeName = soObj.getText('custbody_jaz_ordertype') || '';

        let createdDate = soObj.getValue('createddate');

        let lastModifiedDate = soObj.getValue('lastmodifieddate');

        let orderStatus = soObj.getValue('statusRef');

        let shipDate = soObj.getValue('shipdate');

        let currency = soObj.getValue('currencyname');

        let shipCompelte = soObj.getValue('shipcomplete');

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

            let itemQty = soObj.getSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                line: l
            });

            let itemRate = soObj.getSublistValue({
                sublistId: 'item',
                fieldId: 'rate',
                line: l
            });

            let itemAmount = soObj.getSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
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

            //get the warranty details based on itemtype for the respective line
            let itemType = soObj.getSublistValue({
                sublistId: 'item',
                fieldId: 'itemtype',
                line: l
            });

            let itemWarrantyDetails = [];
            //"Service","Payment","Subtotal","OthCharge","Discount","Description","Markup"
            // if(itemType != "Service" || itemType != "Payment" || itemType != "Subtotal" || itemType != "OthCharge" || itemType != "Discount" ||itemType != "Description" ||itemType != "Markup" || itemType != 'NonInvtPart'){
            if (itemType == 'Kit' || itemType == 'Assembly' || itemType == 'InvtPart') {
                //search for the warranty details
                itemWarrantyDetails = getWarrantyDetailsForItem(itemId, soId);
                // log.debug('itemWarrantyDetails=='+itemWarrantyDetails.length,itemWarrantyDetails);
            }

            itemObj.push({
                line: Number(itemLine),
                price: itemRate || 0,
                id: itemId,
                number: itemSku,
                name: itemName,
                quantity: itemQty,
                location: '',
                serialNumbers: '',
                tax: '',
                warranty: itemWarrantyDetails
            });
        }

        let shipAddressSubRecord = soObj.getSubrecord({
            fieldId: 'shippingaddress'
        });

        let s_lable = shipAddressSubRecord.getValue('label');
        let s_country = shipAddressSubRecord.getValue('country');
        let s_attention = shipAddressSubRecord.getValue('attention');
        let s_addresse = shipAddressSubRecord.getValue('addressee');
        let s_phone = shipAddressSubRecord.getValue('addrphone');
        let s_addr1 = shipAddressSubRecord.getValue('addr1');
        let s_addr2 = shipAddressSubRecord.getValue('addr2');
        let s_city = shipAddressSubRecord.getValue('city');
        let s_state = shipAddressSubRecord.getValue('state');
        let s_zip = shipAddressSubRecord.getValue('zip');

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
            salesOrderTransactionId: tarnId,
            otherRefNum: wocommerceOrderid,
            externalId: wocommerceOrderid,
            createdDate: createdDate,
            lastModifiedDate: lastModifiedDate,
            salesEffectiveDate: salesEffectiveDate,
            transactionDate: tranDate,
            orderStatus: orderStatus,
            shipComplete: shipCompelte,
            shipDate: shipDate,
            currency: currency,
            orderSource: '',
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
            subsidiary: {
                id: subsidiaryId,
                refName: subSidiaryName,
            },
            department: {
                id: departmentId,
                refName: departmentName
            },
            location: {
                id: locationId,
                refName: locationName
            },
            orderType: {
                id: orderType,
                refName: orderTypeName
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
        log.error('Error : In Get Warranty Payload', error);
        return false;
    }
}

//function to sync the data to MuleSoft
const syncBBYSOWarrantyDataToMuleSoft = (payloadObj, globalConfiguration) => {
    try {
        log.debug('POST OPERATION', 'RUNNING');
        let request = https.post({
            body: JSON.stringify(payloadObj),
            url: globalConfiguration[0].app_bby_warranty_order_api_url,
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
            log.debug('BBY_WARRANTY_PUSHED_IN_MULESOFT', "SUCCESSFULLY");
        }
        else {
            log.debug('BBY_WARRANTY_PUSHED_IN_MULESOFT', "UNSUCCESSFULLY");
        }
    } catch (error) {
        log.error('Error : In Sync BBY SO Warranty Data In MuleSoft', error);
    }
}

//function to get the date by adding year and retun in text format
const addYearInDateAndReturnText = (date,yr) =>{
    let d = moment(date,'YYYY-MM-DD');
    let fd = d.add('years',yr);
    let finalDate = format.format({
        value: new Date(fd),
        type: format.Type.DATE
    });
    return finalDate;
}

//function to get the date by adding days and retun in text format
const addDaysInDateAndReturnText = (date,days) =>{
    var nsDate = format.format({
        value: new Date(new Date(date).setDate(new Date(date).getDate()+days+1)),
        type: format.Type.DATE
    });
    return nsDate;
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