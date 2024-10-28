/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event Script
 * Script Name : Tonal UE Send SO To MuleSoft
 * File Name   : Tonal_UE_Send_SO_To_MuleSoft.js
 * Description : This script is used for sync so data to mulesoft
 * Created On  : 06/05/2023
 * Modification Details:  
 * ----Date----                ----Modified By----            ----Description----
 *
 ************************************************************/
/**
 * Update History
 * Version              Date                By                  Requested By                Description
 * V1                   01/08/2023          Vikash                                          Modification for the edit opertaion for update operation
 * V2                   02/08/2023          Vikash                                          Modifcation for the handling approve conetxt trigger point to make mulesoft api call
 * V3                   10/08/2023          Vikash              Joanna Li                   Modification for the stamping of tranid in PO# on SO because IF MR script is looking for this filed value for the fulfilment
 * V4                   14/08/2023          Vikash              Joanna Li                   Modification for the stop triggering of script for other order type, it will only trigger for "B2B" customer type order.And removed unwanted commented code
 * V5                   16/08/2023          Vikash              Joanna Li                   Modificatioon for the removing "getText" for "custbody_customer_type" throwing error and it's going in catch block and setting tranis to Po# for other order type
 * V6                   28/12/2023          Vikash              Joanna Li                   Modificatiction as per the jira ticket [ES-3253]
 * V7                   04/04/2024          Vikash              Joanna                      Modificatiction as per the jira ticket [ES-3445]
 */
define(["N/runtime","N/https","N/record","N/search"], function(runtime,https,record,search) {

    function syncSOToMuleSoft(context) {
        try {
            var ct = context.type;
            var rtc = runtime.executionContext;
            log.debug('ct=='+ct,'rtc=='+rtc);
            if(rtc != 'USERINTERFACE' && rtc != 'CSVIMPORT'){
                return;
            }
            var recData = context.newRecord;
            var i_customerType = recData.getValue('custbody_customer_type');
            log.debug('i_customerType==',i_customerType);
            if((ct == 'create' || ct == 'edit' || ct == 'approve') && i_customerType == 1){

                //get globalConfiguartion details
                var gCDetails = getGlobalConfiguration('MuleSoft');
                log.debug('gCDetails==',JSON.stringify(gCDetails));
                if(gCDetails.length > 0){
                    var soObj = record.load({
                        type: context.newRecord.type,
                        id: context.newRecord.id,
                        isDynamic: true
                    });
    
                    //get the flag for create/update opertaion
                    var exportToMuleSoft = soObj.getValue('custbody_tnl_so_export_to_mulesoft');
                    log.debug('exportToMuleSoft==',exportToMuleSoft);
    
                    //get all the information that needs for the payload
                    var tarnId = soObj.getValue('tranid');
                    var nsCustomerId = soObj.getValue('entity');
                    var customerObj = search.lookupFields({
                        type: search.Type.CUSTOMER,
                        id: nsCustomerId,
                        columns: ['entityid','isperson','firstname','middlename','lastname','companyname','email','phone','datecreated','externalid']
                    });
    
                    log.debug('customerObj==',customerObj);
    
                    var isIndividual = customerObj.isperson;
                    log.debug('isIndividual==',isIndividual);
                    if(isIndividual == true){
                        var customername = customerObj.firstname+' '+customerObj.midname+' '+customerObj.lastname;
                    }   
                    else{
                        var customername = customerObj.companyname
                    }

                    var customerType = soObj.getText('custbody_customer_type');
                    var customerCategory = soObj.getText('custbody_customer_category');
                    log.debug('customerType=='+customerType,'customerCategory=='+customerCategory);
    
                    var tranDate = soObj.getValue('trandate');
                    var wocommerceOrderid = soObj.getValue('otherrefnum');
                    var salesEffectiveDate = soObj.getValue('saleseffectivedate');
    
                    var subsidiaryId = soObj.getValue('subsidiary');
                    var subsidiaryObj = search.lookupFields({
                        type: search.Type.SUBSIDIARY,
                        id: subsidiaryId,
                        columns: ['namenohierarchy']
                    });
                    var subSidiaryName = subsidiaryObj.namenohierarchy;
    
                    var locationId = soObj.getValue('location');
                    var locationName = '';
                    if(locationId){
                        var locationObj =  search.lookupFields({
                            type: search.Type.LOCATION,
                            id: locationId,
                            columns: ['namenohierarchy']
                        });
                        locationName = locationObj.namenohierarchy;
                    }
    
                    var departrmentId = soObj.getValue('department');
                    var departmemntName = '';
                    if(departrmentId){
                        var departmentObj =  search.lookupFields({
                            type: search.Type.DEPARTMENT,
                            id: departrmentId,
                            columns: ['namenohierarchy']
                        });
                        departmemntName = departmentObj.namenohierarchy;
                    }
                    
                    var orderType = soObj.getValue('custbody_jaz_ordertype')||'';
                    var orderTypeName = soObj.getText('custbody_jaz_ordertype')||'';

                    var createdDate = soObj.getValue('createddate');

                    var lastModifiedDate = soObj.getValue('lastmodifieddate');

                    var orderStatus = soObj.getValue('statusRef');

                    var shipDate = soObj.getValue('shipdate');

                    var currency = soObj.getValue('currencyname');

                    var shipCompelte  = soObj.getValue('shipcomplete');

                    var mulesoftError = soObj.getValue('custbody_tnl_ms_error_details');
    
                    var soLines = soObj.getLineCount({
                        sublistId: 'item'
                    });
    
                    var itemObj = [];
                    for(var l = 0 ; l < soLines ; l++){
                        var itemId = soObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'item',
                            line: l
                        });
    
                        var itemName = soObj.getSublistText({
                            sublistId: 'item',
                            fieldId: 'item',
                            line: l
                        });
    
                        var itemQty = soObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'quantity',
                            line: l
                        });
    
                        var itemRate = soObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'rate',
                            line: l
                        });
    
                        var itemAmount = soObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'amount',
                            line: l
                        });

                        var itemLine = soObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'line',
                            line: l
                        });

                        var itemSku = search.lookupFields({
                            type: 'item',
                            id: itemId,
                            columns: ['itemid']
                        }).itemid;
    
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
                        });
                    }

                    log.debug('Item Line:', itemLine);
    
                    var shipAddessSubRecord = soObj.getSubrecord({
                        fieldId: 'shippingaddress'
                    });
    
                    var s_lable = shipAddessSubRecord.getValue('label');
                    var s_country = shipAddessSubRecord.getValue('country');
                    var s_country = shipAddessSubRecord.getValue('country');
                    var s_attention = shipAddessSubRecord.getValue('attention');
                    var s_addresse = shipAddessSubRecord.getValue('addressee');
                    var s_phone = shipAddessSubRecord.getValue('addrphone');
                    var s_addr1 = shipAddessSubRecord.getValue('addr1');
                    var s_addr2 = shipAddessSubRecord.getValue('addr2');
                    var s_city = shipAddessSubRecord.getValue('city');
                    var s_state = shipAddessSubRecord.getValue('state');
                    var s_zip = shipAddessSubRecord.getValue('zip');
    
                    var billingAddressSubRecor = soObj.getSubrecord({
                        fieldId: 'billingaddress'
                    });
    
                    var b_lable = billingAddressSubRecor.getValue('label');
                    var b_country = billingAddressSubRecor.getValue('country');
                    var b_country = billingAddressSubRecor.getValue('country');
                    var b_attention = billingAddressSubRecor.getValue('attention');
                    var b_addresse = billingAddressSubRecor.getValue('addressee');
                    var b_phone = billingAddressSubRecor.getValue('addrphone');
                    var b_addr1 = billingAddressSubRecor.getValue('addr1');
                    var b_addr2 = billingAddressSubRecor.getValue('addr2');
                    var b_city = billingAddressSubRecor.getValue('city');
                    var b_state = billingAddressSubRecor.getValue('state');
                    var b_zip = billingAddressSubRecor.getValue('zip');
    
                    var subtotal = soObj.getValue('subtotal')||0.00;
                    var discount = soObj.getValue('discounttotal')||0.00;
                    var tax = soObj.getValue('taxtotal')||0.00;
                    var total = soObj.getValue('total')||0.00;

                    var muleSoftError = soObj.getValue('custbody_tnl_ms_error_details');
                    log.debug('muleSoftError==',muleSoftError);
    
                    var payloadObj = {
                        salesOrderId : context.newRecord.id,
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
    
                    log.debug('payloadObj==',JSON.stringify(payloadObj));
    
                    //case1: create opertaion if export to mulesoft false and ct is create
                    if(exportToMuleSoft == false && (ct == 'create' || ct == 'approve') && customerType == 'B2B' && orderStatus != 'pendingApproval' && (!muleSoftError || muleSoftError)){
                        log.debug('POST OPERATION','RUNNING');
                        var request = https.post({
                            body: JSON.stringify(payloadObj),
                            url: gCDetails[0].app_order_api_url,
                            headers: {
                                "Content-Type": "application/json",
                                "Accept": "*/*",
                                'Authorization':'Basic '+gCDetails[0].app_auth_token
                            }
                        });
    
                        var responseCode = request.code;
                        var responseBody = request.body;
    
                        log.debug('responseCode=='+responseCode,'responseBody=='+responseBody);
    
                        if(responseCode == 200 && !responseBody.includes("ErroMessage")){
                            var soId = record.submitFields({
                                type: 'salesorder',
                                id: context.newRecord.id,
                                values:{
                                    custbody_tnl_ms_error_details :'',
                                    custbody_tnl_so_export_to_mulesoft :true,
                                    otherrefnum:soObj.getValue('tranid')
                                }
                            });
                            if(soId){
                                log.debug('SO_EXPORTED_TO_MULESOFT',soId);
                            }
                        }
                        else{
                            //update error details field
                            var soId = record.submitFields({
                                type: 'salesorder',
                                id: context.newRecord.id,
                                values:{
                                    custbody_tnl_ms_error_details :JSON.stringify({error:{response_code:responseCode,method:'POST'},message:responseBody}),
                                    otherrefnum:soObj.getValue('tranid')
                                }
                            });
                        }
                    }
    
                    //case2: create opertaion if exported to mulesoft false and transaction previously errored
                    else if(exportToMuleSoft == false && ct == 'edit' && customerType == 'B2B' && orderStatus != 'pendingApproval' && muleSoftError){
                        log.debug('CREATE OPERATION TRANSACTION GOT MULESOFT ERROR SO NOT SYNC TO MULESOFT','SYNCING AGAIN RUNNING');
                        var request = https.post({
                            body: JSON.stringify(payloadObj),
                            url: gCDetails[0].app_order_api_url,
                            headers: {
                                "Content-Type": "application/json",
                                "Accept": "*/*",
                                'Authorization':'Basic '+gCDetails[0].app_auth_token
                            }
                        });
    
                        var responseCode = request.code;
                        var responseBody = request.body;
    
                        log.debug('responseCode=='+responseCode,'responseBody=='+responseBody);
    
                        if(responseCode == 200 && !responseBody.includes("ErroMessage")){
                            var soId = record.submitFields({
                                type: 'salesorder',
                                id: context.newRecord.id,
                                values:{
                                    custbody_tnl_ms_error_details :'',
                                    custbody_tnl_so_export_to_mulesoft :true,
                                    otherrefnum:soObj.getValue('tranid')
                                }
                            });
                            if(soId){
                                log.debug('SO_CREATED_TO_MULESOFT',soId);
                            }
                        }
                        else{
                            //update error details field
                            var soId = record.submitFields({
                                type: 'salesorder',
                                id: context.newRecord.id,
                                values:{
                                    custbody_tnl_ms_error_details :JSON.stringify({error:{response_code:responseCode,method:'POST'},message:responseBody}),
                                    otherrefnum:soObj.getValue('tranid')
                                }
                            });
                        }
                    }

                    //case 3: update opertaion if sync to mulesoft true context is edit
                    else if(exportToMuleSoft == false && ct == 'edit' && customerType == 'B2B' && orderStatus != 'pendingApproval' && !muleSoftError){
                        log.debug('UPDATE OPERATION','RUNNING');
                        var request = https.post({
                            body: JSON.stringify(payloadObj),
                            url: gCDetails[0].app_order_api_url,
                            headers: {
                                "Content-Type": "application/json",
                                "Accept": "*/*",
                                'Authorization':'Basic '+gCDetails[0].app_auth_token
                            }
                        });
    
                        var responseCode = request.code;
                        var responseBody = request.body;
    
                        log.debug('responseCode=='+responseCode,'responseBody=='+responseBody);
    
                        if(responseCode == 200 && !responseBody.includes("ErroMessage")){
                            var soId = record.submitFields({
                                type: 'salesorder',
                                id: context.newRecord.id,
                                values:{
                                    custbody_tnl_ms_error_details :'',
                                    custbody_tnl_so_export_to_mulesoft :true,
                                    otherrefnum:soObj.getValue('tranid')
                                }
                            });
                            if(soId){
                                log.debug('SO_UPDATED_TO_MULESOFT',soId);
                            }
                        }
                        else{
                            //update error details field
                            var soId = record.submitFields({
                                type: 'salesorder',
                                id: context.newRecord.id,
                                values:{
                                    custbody_tnl_ms_error_details :JSON.stringify({error:{response_code:responseCode,method:'PUT'},message:responseBody}),
                                    otherrefnum:soObj.getValue('tranid')
                                }
                            });
                        }
                    }

                    //update PO# with tranid
                    else{
                        var otherrefnum = soObj.getValue('otherrefnum');
                        if(!otherrefnum){
                            record.submitFields({
                                type: context.newRecord.type,
                                id: context.newRecord.id,
                                values: {
                                    otherrefnum:soObj.getValue('tranid')
                                }
                            });
                        }
                    }
                } 
                else{
                    log.debug('NO_ACTION_GLOBAL_CONFIGURATION_MISSING',gCDetails);
                    //update the PO# with tranid
                    var otherrefnum = context.newRecord.getValue('otherrefnum');
                    if(!otherrefnum){
                        record.submitFields({
                            type: context.newRecord.type,
                            id: context.newRecord.id,
                            values: {
                                otherrefnum:context.newRecord.getValue('tranid')
                            }
                        });
                    }
                }
            }
            else{
                log.debug('NO_ACTION_CONTEXT_IS_DIFFERENT',JSON.stringify({ct:ct,rtc:rtc,customer_type:i_customerType}));
            }
        } catch (error) {
            log.error('Error : In Sync SO To MuleSoft',error);
            //update erro details field
            var soId = record.submitFields({
                type: 'salesorder',
                id: context.newRecord.id,
                values:{
                    custbody_tnl_ms_error_details :JSON.stringify({error:{response_code:responseCode,method:'PUT'},message:responseBody}),
                    otherrefnum:context.newRecord.getValue('tranid')
                }
            });
        }
    }

    //function to get the global configuartion details
    function getGlobalConfiguration(thridPartyAppName){
        try {
            var customrecord_tnl_global_configuartionSearchObj = search.create({
                type: "customrecord_integration_configuration",
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
                   search.createColumn({name: "custrecord_tnl_ms_api_url", label: "MULESOFT ORDER API URL"})
                ]
            });
            var searchResultCount = customrecord_tnl_global_configuartionSearchObj.runPaged().count;
            log.debug("GlobalConfiguartion Count",searchResultCount);
            var configurationDetails = [];
            customrecord_tnl_global_configuartionSearchObj.run().each(function(result){
                configurationDetails.push({
                    gc_rec_id:result.id,
                    app_name:result.getValue('name'),
                    app_user_name:result.getValue('custrecord_tnl_ms_user_name'),
                    app_password:result.getValue('custrecord_tnl_ms_password'),
                    app_auth_token:result.getValue('custrecord_tnl_ms_ms_auth_token'),
                    app_order_api_url:result.getValue('custrecord_tnl_ms_api_url')
                });
                return true;
            });
            return configurationDetails;
        } catch (error) {
            log.error('Error : In Get Global Configuaration',error);
            return [];
        }
    }

    return {
        afterSubmit: syncSOToMuleSoft
    }
});