/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR Sync Warranty Details To MuleSoft
 * File Name   : Tonal_MR_Sync_Warranty_Details_To_MuleSoft.js
 * Description : This script is used for sync Warranty details to MuleSoft
 * Created On  : 31/08/2023
 * Modification Details:  
 ************************************************************/
/**
 * Update History       
 * Version         Date             By              Requested By                    Description
 * V1              06/09/2023       Vikash                                          Modification for the expiration dates claculation
 * V2              07/09/2029       Vikash                                          Modification for the expiration dated calculation based on new algo/flow
 * V3              14/09/2023       Vikash          Joanna                          Modifctaion for the considering Activated Warranty to don't calculate dates, only post to MS
 */
let globalConfiguartion = '';
define(
    [
        "N/runtime",
        "N/search",
        "N/https",
        "N/record",
        "N/format"
    ], function(runtime,search,https,record,format) {

    const getInputData = () =>{
        try {
            //get the search data from the script parameters
            let scriptObj = runtime.getCurrentScript();
            let ssId = scriptObj.getParameter('custscript_warranty_data');
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

    const reduce  = (context) =>{
        try {
            // log.debug('reduceContext==',context);
            let scriptObj = runtime.getCurrentScript();
            let fourYearExtendedWarrantyItem = scriptObj.getParameter('custscript_4yr_ext_warr_item');
            let fiveYearExtendedWarrantyItem = scriptObj.getParameter('custscript_5yr_ext_warr_item');
            // log.debug('fourYearExtendedWarrantyItem=='+fourYearExtendedWarrantyItem,'fiveYearExtendedWarrantyItem=='+fiveYearExtendedWarrantyItem);
            let data = JSON.parse(context.values[0]);
            let soId = data.values['GROUP(internalid)'].value;
            let ifId = data.values['GROUP(internalid.applyingTransaction)'].value;
            let ifDate = data.values['GROUP(trandate.applyingTransaction)'];
            log.debug('Processing For So#'+soId,'If#'+ifId+'||IfDate#'+ifDate);//09/03/2023
            let x = ifDate.split('/');
            let d = x[1];
            let m = x[0];
            let y = x[2];
            ifDate = y+'-'+m+'-'+d;

            // log.debug('ifDate==',ifDate);

            //first update the dates and status on the warranty records on the so
            /* const getAllWarrantyRecord = getAllWarrantyRecordDetails(soId);
            log.debug('getAllWarrantyRecord=='+getAllWarrantyRecord.length,getAllWarrantyRecord);
            if(getAllWarrantyRecord.length == 0){
                log.debug('NO_ACTION','THERE_IS_NO_WARRANTY_RECORDS');
                context.write({key:soId,value:{success:false}});
                return;
            } *///not required to vallidate SO having warranty data because search is doing that at first level

            const soObj1 = record.load({
                type: record.Type.SALES_ORDER,
                id: soId,
                isDynamic: true
            });

            let soUpdatedWithWarrantydetails = claculateWarrantyExpiration(soObj1,ifDate,fourYearExtendedWarrantyItem,fiveYearExtendedWarrantyItem);
            // log.debug('soUpdatedWithWarrantydetails==',soUpdatedWithWarrantydetails);
            if(typeof(soUpdatedWithWarrantydetails) == 'object' && soUpdatedWithWarrantydetails.error != undefined){
                log.debug('NOT_SYNC_TO_MULESOFT','ERROR_WHILE_UPDATING_DATES_ON_WARRANTY');
                context.write({key:soId,value:{success:false}});
                return;
            }

            //get the warranty payload
            let warrantyPayload = getSOWarrantyPayload(soUpdatedWithWarrantydetails.toString());
            if(warrantyPayload == false){
                context.write({key:soId,value:{success:false}});
                return;
            }

            context.write({key:soUpdatedWithWarrantydetails,value:{success:true,warranty_payload:warrantyPayload}});
             
        } catch (error) {
            log.errro('Error : In Reduce Stage',error);
            context.write({key:soId,value:{success:false}});
        }
    }

    const summarize = (summary) => {
        try {
            const soIds = [],payloadData = [];
            summary.output.iterator().each(function (key, value) {
                /* log.debug({
                    title: 'Warranty Updated For Order',
                    details: 'key: ' + key + ' / value: ' + value
                }); */

                const data = JSON.parse(value);
                
                if(data.success == true){
                    soIds.push(key);
                    payloadData.push(data.warranty_payload);
                }
                /* if(data.success == false){
                    
                } */
                return true;
            });

            log.debug('soIds=='+soIds.length,soIds);
            if(soIds.length > 0){
                globalConfiguartion = getGlobalConfiguartion('MuleSoft-Warranty');
                if(globalConfiguartion.length == 0){
                    log.debug('NOT_SYNC_TO_MULESOFT','GLOBAL_CONFIG_MISSING');
                    return;
                }
                //sync so with warranty data to MuleSoft
                /* for(let s in soIds){
                    //get the warranty payload object
                    let soWarrantyPaylaod = getSOWarrantyPayload(soIds[s]);
                    if(soWarrantyPaylaod != false){
                        payloadData.push(soWarrantyPaylaod);
                    }
                } */
                
                log.debug('payloadData=='+payloadData.length,payloadData[0]);
                if(payloadData.length >0){
                    //make 50 count of payload for one api call
                    let chunkData = makeArrayDataChunks(payloadData);
                    log.debug('chunkDatacount==',chunkData.length);
                    if(chunkData.length > 0){
                        for(var ci in chunkData){
                            try {
                                syncSOWarrantyDataToMuleSoft(chunkData[ci],globalConfiguartion);
                            } catch (error) {
                                log.debug('Error : While Syncing Data To MS ', error);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            log.error('Error : In Summarize Stage',error);
        }
    }

    //function to get the global configuartion details
    const getGlobalConfiguartion = (thridPartyAppName) =>{
        try {
            const customrecord_tnl_global_configuartionSearchObj = search.create({
                type: "customrecord_tnl_global_configuartion",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["name","is",thridPartyAppName]
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
                   search.createColumn({name: "custrecord_tnl_ms_warranty_order_api_url", label: "MULESOFT Warranty ORDER API URL"})
                ]
            });
            let searchResultCount = customrecord_tnl_global_configuartionSearchObj.runPaged().count;
            log.debug("GlobalConfiguartion Count",searchResultCount);
            const configurationDetails = [];
            customrecord_tnl_global_configuartionSearchObj.run().each(function(result){
                configurationDetails.push({
                    gc_rec_id:result.id,
                    app_name:result.getValue('name'),
                    app_user_name:result.getValue('custrecord_tnl_ms_user_name'),
                    app_password:result.getValue('custrecord_tnl_ms_password'),
                    app_auth_token:result.getValue('custrecord_tnl_ms_ms_auth_token'),
                    app_warranty_order_api_url:result.getValue('custrecord_tnl_ms_warranty_order_api_url')
                });
                return true;
            });
            return configurationDetails;
        } catch (error) {
            log.error('Error : In Get Global Configuaration',error);
            return [];
        }
    }

    //function to get the warranty details based on item as original item on warranty record
    const getWarrantyDetailsForItem = (itemId,soId) =>{
        try {
            const customrecord_warrantySearchObj = search.create({
                type: "customrecord_warranty",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["custrecord_original_order_line_item","anyof",itemId],
                   "AND",
                   ["custrecord_warranty_sales_order","anyof",soId]
                ],
                columns:
                [
                   search.createColumn({name: "id", sort: search.Sort.DESC, label: "ID"}),
                   search.createColumn({name: "custrecord_warranty_item", label: "Warranty Item"}),
                   search.createColumn({name: "custrecord_warranty_item_description", label: "Item Description"}),
                   search.createColumn({name: "custrecord_warranty_serial_number", label: "Serial Number"}),
                   search.createColumn({name: "custrecord_parts_expiration_date", label: "Parts Expiration Date"}),
                   search.createColumn({name: "custrecord_labor_expiration_date", label: "Labor Expiration Date"}),
                   search.createColumn({name: "custrecord_tos_version", label: "TOS Version"}),
                   search.createColumn({name: "custrecord_warranty_status", label: "Warranty Status"}),
                   search.createColumn({name: "custrecord_warranty_type", label: "Warranty Type"}),
                   search.createColumn({name: "custrecord_synced_salesforce", label: "Synced to Salesforce"}),
                   search.createColumn({name: "custrecord_warranty_activation_date", label: "Activation Date"})
                ]
            });
            let searchResultCount = customrecord_warrantySearchObj.runPaged().count;
            log.debug("Warranty Data For SO ITEM#"+soId,searchResultCount);
            const data = [];let line = Number(0);
            customrecord_warrantySearchObj.run().each(function(result){
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
                    "startDate": actDate,//activaltion date
                    "partsExpirationDate": pExpDate,
                    "labourExpirationDate":lExpDate,
                    "tosVersion":result.getText('custrecord_tos_version'),//string
                    "status": result.getText('custrecord_warranty_status'),//string
                    "warrantyType":result.getText('custrecord_warranty_type'),//string
                    "syncedToSalesforce": result.getValue('custrecord_synced_salesforce')
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
                   search.createColumn({name: "custrecord_warranty_type", label: "Warranty Type"}),
                   search.createColumn({name: "custrecord_synced_salesforce", label: "Synced to Salesforce"}),
                   search.createColumn({name: "custrecord_tos_version", label: "Tos Version"}),
                   search.createColumn({name: "custrecord_warranty_status", label: "Warranty Status"}),
                ]
            });
            let searchResultCount = customrecord_warrantySearchObj.runPaged().count;
            log.debug("Warranty Data For SO#"+soId,searchResultCount);
            const data = [];let line = Number(0);
            customrecord_warrantySearchObj.run().each(function(result){
                data.push({
                    original_item_id:result.getValue('custrecord_original_order_line_item'),
                    warranty_item_id:result.getValue('custrecord_warranty_item'),
                    warranty_status:result.getValue('custrecord_warranty_status'),
                    sales_order_id:result.getValue('custrecord_warranty_sales_order'),
                    rec_id:result.id,
                    tos_version:result.getValue('custrecord_tos_version'),
                    warranty_type:result.getValue('custrecord_warranty_type')
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

    //function to calculates dates for warranty record and update
    const claculateWarrantyExpiration = (soObj,ifDate,fourYearExtendedWarrantyItem,fiveYearExtendedWarrantyItem) =>{
        try {
            let warrantyLineCount = soObj.getLineCount('recmachcustrecord_warranty_sales_order');
            //get the item then based on that set the other values
            let items = ['100-0001','121-0006','121-0007','110-0018','110-0017','120-0010','120-0013','121-0005'];//these are fixed skus??
            //check so itemhavig any extended warranty item
            let waranty4yrItem = false, warranty4yrSOItem,waranty5yrItem = false, warranty5yrSOItem;
            for(let ex = 0 ; ex < soObj.getLineCount('item') ; ex++){
                let itemId = soObj.getSublistValue('item','item',ex);
                // log.debug('soItemId=='+itemId);
                if(itemId == fourYearExtendedWarrantyItem){
                    waranty4yrItem = true;
                    warranty4yrSOItem = itemId;break;//added to terminate the unnessary loop once match found
                }
                else if(itemId == fiveYearExtendedWarrantyItem){
                    waranty5yrItem = true;
                    warranty5yrSOItem = itemId;break;
                }
            }
            // log.debug('waranty4yrItem=='+waranty4yrItem,'warranty4yrSOItem=='+warranty4yrSOItem);
            // log.debug('waranty5yrItem=='+waranty5yrItem,'warranty5yrSOItem=='+warranty5yrSOItem);

            for(let wl = 0 ; wl < warrantyLineCount ; wl++){
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
    
                    let regularOrLegecy = soObj.getCurrentSublistValue({
                        sublistId: 'recmachcustrecord_warranty_sales_order',
                        fieldId: 'custrecord_tos_version'
                    });//1 - Legacy, 2 - Regular
                    let regularOrLegecyText = soObj.getCurrentSublistText({
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
    
                    // log.debug('itemSku=='+itemSku,'regularOrLegecy=='+regularOrLegecyText+'||warrantyType=='+warrantyTypeText);

                    //check the stuats if only pending activation then do the dates calculations, else no dates calculations
                    if(warrantyStatus == 1){

                        //standard(regular)
                        if(warrantyType == 1){
                            //check sku
                            if(itemSku == '100-0001' || itemSku=='100-0002'){//main item
                                //regular
                                if(regularOrLegecy == 2){
                                    //+2
                                    let values = addYearInDateAndReturnText(ifDate,2);
                                    if(values){
                                            
                                        soObj.setCurrentSublistText({
                                            sublistId: 'recmachcustrecord_warranty_sales_order',
                                            fieldId: 'custrecord_parts_expiration_date',
                                            text: values
                                        });

                                        soObj.setCurrentSublistText({
                                            sublistId: 'recmachcustrecord_warranty_sales_order',
                                            fieldId: 'custrecord_labor_expiration_date',
                                            text:values
                                        });

                                        itemMatched = true;
                                    }
                                }
                                //legecy
                                else if(regularOrLegecy == 1){
                                    //+1,+3
                                    soObj.setCurrentSublistText({
                                        sublistId: 'recmachcustrecord_warranty_sales_order',
                                        fieldId: 'custrecord_parts_expiration_date',
                                        text: addYearInDateAndReturnText(ifDate,3)
                                    });
        
                                    soObj.setCurrentSublistText({
                                        sublistId: 'recmachcustrecord_warranty_sales_order',
                                        fieldId: 'custrecord_labor_expiration_date',
                                        text: addYearInDateAndReturnText(ifDate,1)
                                    });

                                    itemMatched = true;
                                }
                            }
                            else if(itemSku == '121-0006' || itemSku == '121-0006' || itemSku == '121-0007' || itemSku == '110-0018' 
                            || itemSku == '110-0017' || itemSku == '120-0010' || itemSku == '120-0013' || itemSku == '121-0005'){//accesseries
                                //add 1 yr
                                let values = addYearInDateAndReturnText(ifDate,1);
                                if(values){
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
                        else if(warrantyType == 2){
                            //set 4yr,5yr calculation
                            let values;
                            //4yr
                            if(waranty4yrItem == true){
                                values = addYearInDateAndReturnText(ifDate,4);
                            }
                            //5yr
                            else if(waranty5yrItem == true){
                                values = addYearInDateAndReturnText(ifDate,5);
                            }
                            if(values){
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
                        else if(warrantyType == 3){
                            //+180days
                            let values = addDaysInDateAndReturnText(ifDate,180);
                            if(values){
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
                        else{
                            log.debug('ITEM_NOT_MATCHED_FOR_DATES',itemSku);
                            itemMatched = false;
                        }

                        log.debug('itemMatched==',itemMatched);
        
                        if(itemMatched == true){
                            let x = ifDate;
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

                            log.debug('DATE_SET_FOR',itemSku);
                        }

                    }
                    
                } catch (error) {
                    log.error('Error : While Processing Warranty Line ==',error);
                } 
            }
            let soId = soObj.save();
            if(soId){
                log.debug('SO#=='+soId,'Updated With Warranty Details');
                return Number(soId);
            }
        } catch (error) {
            log.error('Error : In Claculation Warranty Experation',error);
            return {error:error.name,message:error.message};
        }
    }

    //function to form the mulesoft payload
    const getSOWarrantyPayload = (soId) =>{
        try {
            //load the so
            const soObj =  record.load({
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
                columns: ['entityid','isperson','firstname','middlename','lastname','companyname','email','phone','datecreated','externalid']
            });

            log.debug('customerObj==',customerObj);

            let isIndividual = customerObj.isperson;
            // log.debug('isIndividual==',isIndividual);
            if(isIndividual == true){
                let customername = customerObj.firstname+' '+customerObj.midname+' '+customerObj.lastname;
            }   
            else{
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
            if(locationId){
                const locationObj =  search.lookupFields({
                    type: search.Type.LOCATION,
                    id: locationId,
                    columns: ['namenohierarchy']
                });
                locationName = locationObj.namenohierarchy;
            }

            let departrmentId = soObj.getValue('department');
            let departmemntName = '';
            if(departrmentId){
                const departmentObj =  search.lookupFields({
                    type: search.Type.DEPARTMENT,
                    id: departrmentId,
                    columns: ['namenohierarchy']
                });
                departmemntName = departmentObj.namenohierarchy;
            }
            
            let orderType = soObj.getValue('custbody_jaz_ordertype')||'';
            let orderTypeName = soObj.getText('custbody_jaz_ordertype')||'';

            let createdDate = soObj.getValue('createddate');

            let lastModifiedDate = soObj.getValue('lastmodifieddate');

            let orderStatus = soObj.getValue('statusRef');

            let shipDate = soObj.getValue('shipdate');

            let currency = soObj.getValue('currencyname');

            let shipCompelte  = soObj.getValue('shipcomplete');

            let soLines = soObj.getLineCount({
                sublistId: 'item'
            });

            const itemObj = [];
            for(let l = 0 ; l < soLines ; l++){
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
                //"Service","Payment","Subtotal","OthCharge","Discount","Description","Markup"//below check was used with OR operatoer that's why it's checking for the all line items. It needs to be "AND" seprated
                // if(itemType != "Service" || itemType != "Payment" || itemType != "Subtotal" || itemType != "OthCharge" || itemType != "Discount" ||itemType != "Description" ||itemType != "Markup" || itemType != 'NonInvtPart'){
                if(itemType == 'Kit' || itemType == 'Assembly' || itemType == 'InvtPart'){
                    //search for the warranty details
                    itemWarrantyDetails = getWarrantyDetailsForItem(itemId,soId);
                    // log.debug('itemWarrantyDetails=='+itemWarrantyDetails.length,itemWarrantyDetails);
                }

                itemObj.push({
                    line:Number(itemLine),
                    price:itemRate || 0,
                    id:itemId,
                    number:itemSku,
                    name:itemName,
                    quantity:itemQty,
                    location:'',
                    serialNumbers:'',
                    tax:'',
                    warranty:itemWarrantyDetails
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

            let subtotal = soObj.getValue('subtotal')||0.00;
            let discount = soObj.getValue('discounttotal')||0.00;
            let tax = soObj.getValue('taxtotal')||0.00;
            let total = soObj.getValue('total')||0.00;

            let payloadObj = {
                salesOrderId : soId,
                salesOrderTransactionId:tarnId,
                otherRefNum:wocommerceOrderid,
                externalId:wocommerceOrderid,
                createdDate : createdDate,
                lastModifiedDate:lastModifiedDate,
                salesEffectiveDate:salesEffectiveDate,
                transactionDate:tranDate,
                orderStatus:orderStatus,
                shipComplete:shipCompelte,
                shipDate:shipDate,
                currency:currency,
                orderSource:'',
                customerType:customerType,
                customerCategory:customerCategory,
                customer:{
                    dateCreated:customerObj.datecreated,
                    email:customerObj.email,
                    externalId:customerObj.externalid[0].value,
                    id:nsCustomerId,
                    phone:customerObj.phone
                },
                billingAddress:{
                    name:customerObj.firstname+' '+customerObj.lastname,
                    addr1:b_addr1,
                    addr2:b_addr2,
                    city:b_city,
                    state:b_state,
                    country:b_country,
                    zip:b_zip,
                    attention:b_attention,
                    phone:b_phone
                },
                shippingAddress:{
                    name:customerObj.firstname+' '+customerObj.lastname,
                    addr1:s_addr1,
                    addr2:s_addr2,
                    city:s_city,
                    state:s_state,
                    country:s_country,
                    zip:s_zip,
                    attention:s_attention,
                    phone:s_phone
                },
                subsidiary:{
                    id:subsidiaryId,
                    refName:subSidiaryName,
                },
                department:{
                    id:departrmentId,
                    refName:departmemntName
                },
                location:{
                    id:locationId,
                    refName:locationName
                },
                orderType:{
                    id:orderType,
                    refName:orderTypeName
                },
                items:itemObj,
                amount:{
                    subtotal:subtotal,
                    discount:discount,
                    tax:tax,
                    total:total
                }
            }

            // log.debug('payloadObj==',JSON.stringify(payloadObj));
            return payloadObj;
        } catch (error) {
            log.error('Error : In Get Warranty Payload',error);
            return false;
        }
    }

    //function to get the date form ifDate and adding days in that
    const addDays = (date, days) => {
        let result = new Date(date);
        result.setDate(result.getDate() + days);
        log.debug('futureDaysDate==',new Date(result.setDate(result.getDate() + days)));
        return result;
    }

    //function to get the future date by adding years
    const addYears = (dt,n) => {
        let result = dt//new Date(dt);
        log.debug('futureYearDate==',result.setFullYear(result.getFullYear() + n));
        return result.setFullYear(result.getFullYear() + n);      
    }

    //function to sync the data to MuleSoft
    const syncSOWarrantyDataToMuleSoft = (payloadObj,globalConfiguartion) =>{
        try {
            log.debug('POST OPERATION','RUNNING');
            let request = https.post({
                body: JSON.stringify(payloadObj),
                url: globalConfiguartion[0].app_warranty_order_api_url,
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "*/*",
                    'Authorization':'Basic '+globalConfiguartion[0].app_auth_token
                }
            });

            let responseCode = request.code;
            let responseBody = request.body;

            log.debug('responseCode=='+responseCode,'responseBody=='+responseBody);

            if(responseCode == 200){
                log.debug('WARRANTY_PUSHED_IN_MULESOFT',"SUCCESSFULLY");
            }
            else{
                log.debug('WARRANTY_PUSHED_IN_MULESOFT',"UNSUCCESSFULLY");
            }
        } catch (error) {
            log.error('Error : In Sync SO Warranty Data In MuleSoft',error);
        }
    }

    //function to get the date by adding year and retun in text format
    const addYearInDateAndReturnText = (date,yr) =>{
        var x = new Date(date);
        var y = x.getFullYear()+yr;
        var fd = x.setFullYear(y);
        var fdd = new Date(fd);
        var m = fdd.getMonth()+1;
        if(m < 10){
            m = '0'+m;
        }
        var lastDay = new Date(fdd.getFullYear(), fdd.getMonth() + 1, 0);
        var ld = format.format({
            value: new Date(lastDay),
            type: format.Type.DATE
        });
        ld = ld.split('/')[1];
        var d = fdd.getDate();
        // log.debug('ld=='+ld,'d=='+d);
        if(d == ld){
            d = ld;
        }
        else{
            var d = fdd.getDate()+1;//adding 1 because it's giving one day less
        }
        if(d < 10){
            d = '0'+d;
        }
        var final = m + '/' + d + '/' + fdd.getFullYear();
        // log.debug('addYearInDateAndReturnText==',final);
        return final;
    }

    //function to get the date by adding days and retun in text format
    const addDaysInDateAndReturnText = (date,days) =>{
        var x = new Date(date);
        var y = x.getDate()+days;
        var fd = x.setDate(y);
        var fdd = new Date(fd);
        var m = fdd.getMonth()+1;
        if(m < 10){
            m = '0'+m;
        }
        var lastDay = new Date(fdd.getFullYear(), fdd.getMonth() + 1, 0);
        var ld = format.format({
            value: new Date(lastDay),
            type: format.Type.DATE
        });
        ld = ld.split('/')[1];
        var d = fdd.getDate();
        // log.debug('ld=='+ld,'d=='+d);
        if(d == ld){
            d = ld;
        }
        else{
            var d = fdd.getDate()+1;//adding 1 because it's giving one day less
        }
        if(d < 10){
            d = '0'+d;
        }
        var final = m + '/' + d + '/' + fdd.getFullYear();
        // log.debug('addDaysInDateAndReturnText==',final);
        return final;
    }

    //function to make chunks of array
    const makeArrayDataChunks = (dataArray) =>{
        try {
            let  perChunk = 60 // items per chunk(IN SB 50,FOR PROD 50)    

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

    return {
        getInputData: getInputData,
        reduce: reduce,
        summarize:summarize
    }
});