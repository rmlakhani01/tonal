/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event Script
 * Script Name : Tonal UE Create IT For Installation
 * File Name   : Tonal_UE_Create_IT_For_Installation.js
 * Description : This script is used for creation of IT for Installation based on CSV/UI/InlineEdit
 * of header field "USER INPUT - INSTALL DATE" on Bulk SO
 * Created On  : 23/03/2023
 * Modification Details:  
 * Version       By               Instance                Date                        Description
 * V1            Vikash           SB1                     03/04/2023                  Updated logic for check first IT created or not,if yes then no need to process else process.
 *                                                                                    If Carrire is "Flagship Will Call", "Will Call" and "XPO" on Bulk then only process 
 ************************************************************/
define(["N/runtime","N/search","N/record"], function(runtime,search,record) {

    function createInstallationIT(context) {
        try {
            var ct = context.type;
            var rtc = runtime.executionContext;
            log.debug('ct=='+ct,'rtc=='+rtc);
            if((ct == 'edit' || ct == 'create' || ct == 'xedit') && (rtc == runtime.ContextType.CSV_IMPORT || rtc == runtime.ContextType.USER_INTERFACE || rtc == runtime.ContextType.USEREVENT)){
                var bulkSoObj = record.load({
                    type: context.newRecord.type,
                    id: context.newRecord.id,
                    isDynamic: true
                });

                //get the carrier information from BULK to proceed further
                var bulkObj1 = search.lookupFields({
                    type: 'customrecord_bulk',
                    id: bulkSoObj.getValue('custrecord_bo_so_parent'),
                    columns: ['custrecord_bo_carrier']
                });

                var carrierType = bulkObj1.custrecord_bo_carrier[0].text;

                log.debug('carrierType==',carrierType);

                if(carrierType == 'XPO' || carrierType == 'Flagship Will Call' || carrierType == 'Will Call'){
                    //get the USER INPUT - INSTALL DATE
                    var installDate = bulkSoObj.getValue('custrecord_user_input_install_date');
                    log.debug('installDate==',installDate);

                    if(installDate){

                        var orderId = bulkSoObj.getValue('custrecord_bo_so_customer_order_no');

                        var nsSoId = bulkSoObj.getValue('custrecord_bo_so_sales_order');
                        
                        var bulkSoLines = bulkSoObj.getLineCount({
                            sublistId: 'recmachcustrecord_bo_so_line_parent'
                        });
        
                        log.debug('bulkSoLines=='+bulkSoLines,'orderId=='+orderId+'||nsSoId=='+nsSoId);

                        //get the bulk 
                        var bulk = bulkSoObj.getValue('custrecord_bo_so_parent');

                        var bulkObj = search.lookupFields({
                            type: 'customrecord_bulk',
                            id: bulk,
                            columns: ['custrecord_bo_num','name','custrecord_bo_in_transit_location','custrecord_bo_to_location']
                        });

                        log.debug('bulkObj==',bulkObj);

                        //loop over the line and check for the ship Qty or released qty
                        var shipItemDetails = [],releasedItemDetails = [];
                        for(var l = 0 ; l < bulkSoLines ; l++){
                            var shipQty = bulkSoObj.getSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_shipped_qty',
                                line: l
                            });

                            var releasedQty = bulkSoObj.getSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_released_qty',
                                line: l
                            });

                            var installationDate = bulkSoObj.getSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_installation_date',
                                line: l
                            });

                            var installationITCreated = bulkSoObj.getSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_install_inv_trans',
                                line: l
                            });

                            // log.debug('shipQty=='+shipQty,'releasedQty=='+releasedQty);

                            if(!installationITCreated){
                                if(shipQty){
                                    shipItemDetails.push({
                                        item:bulkSoObj.getSublistText({sublistId: 'recmachcustrecord_bo_so_line_parent',fieldId: 'custrecord_bo_so_line_item',line: l}),
                                        id:bulkSoObj.getSublistValue({sublistId: 'recmachcustrecord_bo_so_line_parent',fieldId: 'custrecord_bo_so_line_item',line: l}),
                                        qty:bulkSoObj.getSublistValue({sublistId: 'recmachcustrecord_bo_so_line_parent',fieldId: 'custrecord_bo_so_line_shipped_qty',line: l}),
                                        line_index:l
                                    });
                                }
                                if(releasedQty){
                                    releasedItemDetails.push({
                                        item:bulkSoObj.getSublistText({sublistId: 'recmachcustrecord_bo_so_line_parent',fieldId: 'custrecord_bo_so_line_item',line: l}),
                                        id:bulkSoObj.getSublistValue({sublistId: 'recmachcustrecord_bo_so_line_parent',fieldId: 'custrecord_bo_so_line_item',line: l}),
                                        qty:bulkSoObj.getSublistValue({sublistId: 'recmachcustrecord_bo_so_line_parent',fieldId: 'custrecord_bo_so_line_released_qty',line: l}),
                                        line_index:l
                                    });
                                }
                            }
                        }
                        
                        log.debug('shipItemDetails==',shipItemDetails);
                        log.debug('releasedItemDetails==',releasedItemDetails);

                        var ITCreated = '';
                        if(shipItemDetails.length > 0){
                            ITCreated = createITInNetSuite(bulkObj,shipItemDetails,orderId,bulk,installDate,nsSoId);
                            log.debug('ITCreatedS==',ITCreated);
                            //fail
                            if(ITCreated.error){
                                //updateBulkSoLinesWithError
                                updateBulkSoLinesWithError(shipItemDetails,ITCreated.error,bulkSoObj,installDate);
                            }
                            //sucess
                            else{
                                updateBulkSoLinesWithSuccess(shipItemDetails,ITCreated,bulkSoObj,installDate);
                            }
                        }
                        else if(releasedItemDetails.length > 0){
                            ITCreated = createITInNetSuite(bulkObj,releasedItemDetails,orderId,bulk,installDate,nsSoId);
                            log.debug('ITCreatedR==',ITCreated);
                            //fail
                            if(ITCreated.error){
                                //updateBulkSoLinesWithError
                                updateBulkSoLinesWithError(releasedItemDetails,ITCreated.error,bulkSoObj,installDate)
                            }
                            //sucess
                            else{
                                updateBulkSoLinesWithSuccess(releasedItemDetails,ITCreated,bulkSoObj,installDate);
                            }
                        }
                    }
                    else{
                        log.debug('MISSING_INSTALLATION_DATE','NO_ACTION');
                    } 

                } 
                else{
                    log.debug('CARRIER_IS_DIFFERENT_NO_ACTION',carrierType);
                } 
            }
            else{
                log.debug('MISSING_TRIGGER_POINT_NO_ACTION',JSON.stringify({ct:ct,rtc:rtc}));
            }
        } catch (error) {
            log.error('Error : In Create Installation IT',error);
        }
    }

    //function to create the IT in NetSuite
    function createITInNetSuite(bulkObj,lineItemDetails,orderId,bulkId,installDate,nsSoId){
        try {
            var itObj = record.create({
                type: record.Type.INVENTORY_TRANSFER,
                isDynamic: true
            });

            //set CUSTOMER ORDER NO
            itObj.setValue('custbody_customer_order_no',orderId);

            //set Bulk Order No
            itObj.setValue('custbody_tonal_bulk_order_no',bulkObj.custrecord_bo_num);

            //set BULK ORDER NUMBER List
            itObj.setValue('custbody_ns_bulk_order_no',bulkId);

            //set NS Sales order
            itObj.setValue('custbody_customer_so',nsSoId);

            //set subsidiary
            itObj.setValue('subsidiary',1);//default

            //set trandate 
            itObj.setValue('trandate',new Date(installDate));

            //set externalid
            itObj.setValue('externalid',bulkObj.custrecord_bo_num+'_'+orderId+'-I');

            //get the from location from the BULK PARENT
            var fromloc = bulkObj.custrecord_bo_to_location[0].value;

            //get the to location is always Pending Activation(Pending_Activation)
            //get the location by to location(externalid)
            var toloc = getLocationByExternalId('Pending_Activation');
            log.debug('toloc==',toloc);
            //fail 
            if(typeof(toloc) == 'object'){
                return toloc;
            }
            //sucess
            log.debug('fromloc=='+fromloc,'toloc=='+toloc);
            //set from location
            itObj.setValue('location',fromloc);

            //set tolocation
            itObj.setValue('transferlocation',toloc);

            //set type
            itObj.setValue('custbody_inventory_transfer_type',4);

            for(var x = 0 ; x < lineItemDetails.length ; x++){
                itObj.selectNewLine({
                    sublistId: 'inventory'
                });

                itObj.setCurrentSublistValue({
                    sublistId: 'inventory',
                    fieldId: 'item',
                    value: lineItemDetails[x].id
                });

                itObj.setCurrentSublistValue({
                    sublistId: 'inventory',
                    fieldId: 'adjustqtyby',
                    value: lineItemDetails[x].qty
                });

                itObj.commitLine({
                    sublistId: 'inventory'
                });
            }

            var newITRecId = itObj.save();
            if(newITRecId){
                log.debug('New IT Created==',newITRecId);
                return {message:'success',ns_inventory_transfer_id:Number(newITRecId),item_details:lineItemDetails,order_id:orderId};
            } 
        } catch (error) {
            log.error('Error : In Create IT',error);
            return {message:'fail',error:error}
        }
    }

    //function to get the location by externalid
    function getLocationByExternalId(externalid){
        try {
            var locationSearchObj = search.create({
                type: "location",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND",
                   ["externalid","is",externalid]
                ],
                columns:
                [
                   search.createColumn({
                      name: "name",
                      sort: search.Sort.ASC,
                      label: "Name"
                   }),
                ]
            });
            var searchResultCount = locationSearchObj.runPaged().count;
            log.debug("Location count",searchResultCount);
            var locId = {error:'LOCATION_NOT_FOUND',message:'Location Missing By ExternalId '+externalid};
            locationSearchObj.run().each(function(result){
                locId = Number(result.id);
                return true;
            });
            return Number(locId);
        } catch (error) {
            log.error('Error : In Get Location',error);
            return{error:error.name,message:error.message};
        }
    }

    //function to update bulk so lines with error
    function updateBulkSoLinesWithError(lineItems,error,bulkSoObj,installDate){
        try {
            for(var c  = 0 ; c < lineItems.length ; c++){

                bulkSoObj.selectLine({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    line: lineItems[c].line_index
                });

                bulkSoObj.setCurrentSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_installation_date',
                    value: new Date(installDate)
                });

                bulkSoObj.setCurrentSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_error_msg',
                    value: JSON.stringify(error)
                });

                bulkSoObj.commitLine({
                    sublistId: 'recmachcustrecord_bo_so_line_parent'
                })
            }

            var bulkSOId = bulkSoObj.save();

            if(bulkSOId){
                log.debug('BULK SO UPDATED WITH ERROR',bulkSOId);
            }
        } catch (error) {
            log.error('Error : In Update Bulk So Line With Error',error);
        }
    }

    //function to update bulk so lines with sucess
    function updateBulkSoLinesWithSuccess(lineItems,it,bulkSoObj,installDate){
        try {
            for(var c  = 0 ; c < lineItems.length ; c++){

                bulkSoObj.selectLine({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    line: lineItems[c].line_index
                });

                bulkSoObj.setCurrentSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_installation_date',
                    value: new Date(installDate)
                });

                bulkSoObj.setCurrentSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_install_inv_trans',
                    value: it.ns_inventory_transfer_id
                });

                bulkSoObj.setCurrentSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_installed_qty',
                    value: lineItems[c].qty
                });

                var errorMesg = bulkSoObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_error_msg',
                });

                if(errorMesg){
                    bulkSoObj.setCurrentSublistValue({
                        sublistId: 'recmachcustrecord_bo_so_line_parent',
                        fieldId: 'custrecord_bo_so_line_error_msg',
                        value: ''
                    });
                }

                bulkSoObj.commitLine({
                    sublistId: 'recmachcustrecord_bo_so_line_parent'
                })
            }

            var bulkSOId = bulkSoObj.save();

            if(bulkSOId){
                log.debug('BULK SO UPDATED WITH SUCESS',bulkSOId);
            }
        } catch (error) {
            log.error('Error : In Update Bulk So Line With Success',error);
        }
    }

    return {
        afterSubmit: createInstallationIT
    }
});
