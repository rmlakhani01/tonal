/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Create IT And Update Dates On BO Lines
 * File Name   : Tonal_MR_Create_IT_And_Update_Dates_On_BO_Lines.js
 * Description : This script is invoked from the suitelet error reprocess for bo so lines
 * Created On  : 02/02/2023
 * Modification Details:
 * Version     Instance          By              Date              Description
 * V1          SB1               Vikash          23/03/2023        modification for When 1 or 2 columns do not have "Data Conversion", the Suitelet should allow reprocessing for the inventory transfer types without "Data Conversion" populated on the File Names.
 * V2          SB2               Vikash          03/10/2023        modification for the removing of IT creation for the insatallation process. We are going to create IF for the installation date 
 ************************************************************/
define(["N/runtime","N/record","N/search"], function(runtime,record,search) {

    function getInputData() {
        try {
            var scriptObj = runtime.getCurrentScript();
            var data = scriptObj.getParameter('custscript_mm_reprocess_data');
            var subsidiary = scriptObj.getParameter('custscript_it_subsidiary');
            log.debug('subsidiary=='+subsidiary,'data=='+data);
            if(!data || !subsidiary){
                return [];
            }
            return JSON.parse(data);
        } catch (error) {
            log.error('Error : In Get Input Stage');
            return [];
        }
    }

    function map(context) {
        try {
            log.debug('mapContext==',context);
            var data = JSON.parse(context.value);
            var bulkOrderId = data.bulk_order_rec_id;
            var boSoLineData = data.data;
            var boSoLineCount = boSoLineData.length;

            //loop over all the boSoLines and check which IT is not created RIT,DIT,IIT
            var D_itCreationDetailsShipQty = [],D_itCreationDetailsReleasedQty = [],arrObjD = [],arrObjR = [],arrObjI = [],
            R_itCreationDetailsShipQty = [],R_itCreationDetailsReleasedQty = [],I_itCreationDetailsShipQty = [],I_itCreationDetailsReleasedQty = [],
            createDIT = false,createRIT = false,createIIT = false;

            //check any of the line having IT created, if so do not consider for the IT creation.
            //if line item length and -NA- legth equal then only consider for IT
            var ditNotAvilableCount = boSoLineData.filter((obj)=> obj.d_it === '-NA-' && obj.d_date != '-NA-' && obj.dfn != 'Data Conversion').length;
            var ritNotAvilableCount = boSoLineData.filter((obj)=> obj.r_it === '-NA-' && obj.r_date != '-NA-' && obj.rfn != 'Data Conversion').length;
            var iitNotAvilableCount = boSoLineData.filter((obj)=> obj.i_it === '-NA-' && obj.i_date != '-NA-' && obj.ifn != 'Data Conversion').length;
            log.debug('boSoLineCount=='+boSoLineCount,'ditNotAvilableCount=='+ditNotAvilableCount);
            log.debug('boSoLineCount=='+boSoLineCount,'ritNotAvilableCount=='+ritNotAvilableCount);
            log.debug('boSoLineCount=='+boSoLineCount,'iitNotAvilableCount=='+iitNotAvilableCount);

            //case1: create delivery IT
            if(boSoLineCount == ditNotAvilableCount){
                createDIT = true;
            }

            //case2: create receiving IT
            if(boSoLineCount == ritNotAvilableCount){
                createRIT = true;
            }

            //case3: create installation IT
            if(boSoLineCount == iitNotAvilableCount){
                createIIT = true;
            }

            log.debug('createDIT=='+createDIT,'createRIT=='+createRIT+'||createIIT=='+createIIT);

            for(var c in boSoLineData){
                arrObjD = [],arrObjR = [],arrObjI = [];
                var dit = boSoLineData[c].d_it;
                var rit = boSoLineData[c].r_it;
                var iit = boSoLineData[c].i_it;
                if(createDIT == true){
                    //check for the shipqty first,then relesed qty
                    var sQty = Number(boSoLineData[c].shipped_qty);
                    var rQty = Number(boSoLineData[c].realesed_qty);
                    if(sQty > 0){
                        var index = D_itCreationDetailsShipQty.findIndex(function(obj){
                            return obj.so_parent == bulkOrderId;
                        });

                        var obj1 = {
                            item:boSoLineData[c].item,
                            qty:sQty
                        }

                        if(index == -1){
                            arrObjD.push(obj1);
                            var obj = {
                                it_type:'delivery',
                                is_ship_qty:true,
                                so_parent:bulkOrderId,
                                delivery_date:boSoLineData[c].d_date,
                                items: arrObjD
                            };
                            
                            D_itCreationDetailsShipQty.push(obj);
                        }
                        else{
                            D_itCreationDetailsShipQty[index].items.push(obj1);
                        }
                    }
                    else if(rQty > 0){
                        var index = D_itCreationDetailsReleasedQty.findIndex(function(obj){
                            return obj.so_parent == bulkOrderId;
                        });

                        var obj1 = {
                            item:boSoLineData[c].item,
                            qty:rQty
                        }

                        if(index == -1){
                            arrObjD.push(obj1);
                            var obj = {
                                it_type:'delivery',
                                is_released_qty:true,
                                delivery_date:boSoLineData[c].d_date,
                                so_parent:bulkOrderId,
                                items: arrObjD
                            };
                            
                            D_itCreationDetailsReleasedQty.push(obj);
                        }
                        else{
                            D_itCreationDetailsReleasedQty[index].items.push(obj1);
                        }
                    }
                }
                if(createRIT == true){
                    //check for the shipqty first,then relesed qty
                    var sQty = Number(boSoLineData[c].shipped_qty);
                    var rQty = Number(boSoLineData[c].realesed_qty);
                    if(sQty > 0){
                        var index = R_itCreationDetailsShipQty.findIndex(function(obj){
                            return obj.so_parent == bulkOrderId;
                        });

                        var obj1 = {
                            item:boSoLineData[c].item,
                            qty:sQty
                        }

                        if(index == -1){
                            arrObjR.push(obj1);
                            var obj = {
                                it_type:'receiving',
                                is_ship_qty:true,
                                so_parent:bulkOrderId,
                                receipt_date:boSoLineData[c].r_date,
                                items: arrObjR
                            };
                            
                            R_itCreationDetailsShipQty.push(obj);
                        }
                        else{
                            R_itCreationDetailsShipQty[index].items.push(obj1);
                        }
                    }
                    else if(rQty > 0){
                        var index = R_itCreationDetailsReleasedQty.findIndex(function(obj){
                            return obj.so_parent == bulkOrderId;
                        });

                        var obj1 = {
                            item:boSoLineData[c].item,
                            qty:rQty
                        }

                        if(index == -1){
                            arrObjR.push(obj1);
                            var obj = {
                                it_type:'receiving',
                                is_released_qty:true,
                                receipt_date:boSoLineData[c].r_date,
                                so_parent:bulkOrderId,
                                items: arrObjR
                            };
                            
                            R_itCreationDetailsReleasedQty.push(obj);
                        }
                        else{
                            R_itCreationDetailsReleasedQty[index].items.push(obj1);
                        }
                    }
                }
                if(createIIT == true){
                    //check for the shipqty first,then relesed qty
                    var sQty = Number(boSoLineData[c].shipped_qty);
                    var rQty = Number(boSoLineData[c].realesed_qty);
                    if(sQty > 0){
                        var index = I_itCreationDetailsShipQty.findIndex(function(obj){
                            return obj.so_parent == bulkOrderId;
                        });

                        var obj1 = {
                            item:boSoLineData[c].item,
                            qty:sQty
                        }

                        if(index == -1){
                            arrObjI.push(obj1);
                            var obj = {
                                it_type:'installation',
                                is_ship_qty:true,
                                so_parent:bulkOrderId,
                                installation_date:boSoLineData[c].i_date,
                                items: arrObjI
                            };
                            
                            I_itCreationDetailsShipQty.push(obj);
                        }
                        else{
                            I_itCreationDetailsShipQty[index].items.push(obj1);
                        }
                    }
                    else if(rQty > 0){
                        var index = I_itCreationDetailsReleasedQty.findIndex(function(obj){
                            return obj.so_parent == bulkOrderId;
                        });

                        var obj1 = {
                            item:boSoLineData[c].item,
                            qty:rQty
                        }

                        if(index == -1){
                            arrObjI.push(obj1);
                            var obj = {
                                it_type:'installation',
                                is_released_qty:true,
                                installation_date:boSoLineData[c].i_date,
                                so_parent:bulkOrderId,
                                items: arrObjI
                            };
                            
                            I_itCreationDetailsReleasedQty.push(obj);
                        }
                        else{
                            I_itCreationDetailsReleasedQty[index].items.push(obj1);
                        }
                    }
                } 
            }   

            log.debug('D_itCreationDetailsShipQty==',D_itCreationDetailsShipQty);
            log.debug('D_itCreationDetailsReleasedQty==',D_itCreationDetailsReleasedQty);
            log.debug('R_itCreationDetailsShipQty==',R_itCreationDetailsShipQty);
            log.debug('R_itCreationDetailsReleasedQty==',R_itCreationDetailsReleasedQty);
            log.debug('I_itCreationDetailsShipQty==',I_itCreationDetailsShipQty);
            log.debug('I_itCreationDetailsReleasedQty==',I_itCreationDetailsReleasedQty);

            var ITCreated = '';

            if(createDIT == true){
                var shipQtyITDetails = D_itCreationDetailsShipQty,releasedQtyITdetails = D_itCreationDetailsReleasedQty;
                if(shipQtyITDetails.length > 0){
                    var type = shipQtyITDetails[0].it_type;
                    if(type == 'delivery'){
                        ITCreated = createITInNetSuite(shipQtyITDetails[0].delivery_date,type,shipQtyITDetails[0].so_parent,shipQtyITDetails[0].items);
                        if(ITCreated.error == undefined){
                            updateSoLinesRecord(ITCreated.bulk_so_id,'delivery',shipQtyITDetails[0].delivery_date,ITCreated.ns_inventory_transfer_id,shipQtyITDetails[0].items,'');
                        }
                        else if(ITCreated.error){
                            updateErrorSoLinesRecord(shipQtyITDetails[0].so_parent,'','','',shipQtyITDetails[0].items,'',ITCreated);
                        }
                    }                
                }
                else if(releasedQtyITdetails.length > 0){
                    var type = releasedQtyITdetails[0].it_type;
                    if(type == 'delivery'){
                        ITCreated = createITInNetSuite(releasedQtyITdetails[0].delivery_date,type,releasedQtyITdetails[0].so_parent,releasedQtyITdetails[0].items);
                        if(ITCreated.error == undefined){
                            updateSoLinesRecord(ITCreated.bulk_so_id,'delivery',releasedQtyITdetails[0].delivery_date,ITCreated.ns_inventory_transfer_id,releasedQtyITdetails[0].items,'');
                        }
                        else if(ITCreated.error){
                            updateErrorSoLinesRecord(releasedQtyITdetails[0],'','','',releasedQtyITdetails[0].items,'',ITCreated);
                        }
                    }
                }
                log.debug('ITCreatedDelivery==',ITCreated);
            }

            if(createRIT == true){
                var shipQtyITDetails = R_itCreationDetailsShipQty,releasedQtyITdetails = R_itCreationDetailsReleasedQty;
                if(shipQtyITDetails.length > 0){
                    var type = shipQtyITDetails[0].it_type;      
                    if(type == 'receiving'){
                        ITCreated = createITInNetSuite(shipQtyITDetails[0].receipt_date,type,shipQtyITDetails[0].so_parent,shipQtyITDetails[0].items);
                        if(ITCreated.error == undefined){
                            updateSoLinesRecord(ITCreated.bulk_so_id,'receiving',shipQtyITDetails[0].receipt_date,ITCreated.ns_inventory_transfer_id,shipQtyITDetails[0].items,'');
                        }
                        else if(ITCreated.error){
                            updateErrorSoLinesRecord(shipQtyITDetails[0].so_parent,'','','',shipQtyITDetails[0].items,'',ITCreated);
                        }
                    }               
                }
                else if(releasedQtyITdetails.length > 0){
                    var type = releasedQtyITdetails[0].it_type;
                    if(type == 'receiving'){
                        ITCreated = createITInNetSuite(releasedQtyITdetails[0].receipt_date,type,releasedQtyITdetails[0].so_parent,releasedQtyITdetails[0].items);
                        if(ITCreated.error == undefined){
                            updateSoLinesRecord(ITCreated.bulk_so_id,'receiving',releasedQtyITdetails[0].receipt_date,ITCreated.ns_inventory_transfer_id,releasedQtyITdetails[0].items,'');
                        }
                        else if(ITCreated.error){
                            updateErrorSoLinesRecord(releasedQtyITdetails[0].so_parent,'','','',releasedQtyITdetails[0].items,'',ITCreated);
                        }
                    }
                }
                log.debug('ITCreatedReceiving==',ITCreated);
            }

            if(createIIT == true){
                var shipQtyITDetails = I_itCreationDetailsShipQty,releasedQtyITdetails = I_itCreationDetailsReleasedQty;
                if(shipQtyITDetails.length > 0){
                    var type = shipQtyITDetails[0].it_type;
                    if(ITCreated.error == undefined){
                        // ITCreated = createITInNetSuite(shipQtyITDetails[0].installation_date,type,shipQtyITDetails[0].so_parent,shipQtyITDetails[0].items);
                        ITCreated = createItemFulfilment(shipQtyITDetails[0].so_parent,shipQtyITDetails[0].installation_date,shipQtyITDetails[0].items);
                        if(!ITCreated.error){
                            updateSoLinesRecord(ITCreated.bulk_so_id,'installation',shipQtyITDetails[0].installation_date,ITCreated.ns_itemfulfilment_id,shipQtyITDetails[0].items,'');
                        }
                        else if(ITCreated.error){
                            updateErrorSoLinesRecord(shipQtyITDetails[0].so_parent,'','','',shipQtyITDetails[0].items,'',ITCreated);
                        }
                    }
                    
                }
                else if(releasedQtyITdetails.length > 0){
                    var type = releasedQtyITdetails[0].it_type;
                    if(type == 'installation'){
                        // ITCreated = createITInNetSuite(releasedQtyITdetails[0].installation_date,type,releasedQtyITdetails[0].so_parent,releasedQtyITdetails[0].items);
                        ITCreated = createItemFulfilment(releasedQtyITdetails[0].so_parent,releasedQtyITdetails[0].installation_date,releasedQtyITdetails[0].items);
                        if(ITCreated.error == undefined){
                            updateSoLinesRecord(ITCreated.bulk_so_id,'installation',releasedQtyITdetails[0].installation_date,ITCreated.ns_itemfulfilment_id,releasedQtyITdetails[0].items,'');
                        }
                        else if(ITCreated.error){
                            updateErrorSoLinesRecord(releasedQtyITdetails[0].so_parent,'','','',releasedQtyITdetails[0].items,'',ITCreated);
                        }
                    }
                }
                log.debug('ITCreatedInstallation==',ITCreated);
            }

        } catch (error) {
            log.error('Error : In Map Stage',error);
        }
    }

    //function to create the IT in NetSuite
    function createITInNetSuite(date,type,soParent,lineItemDetails){
        try {

            //get the bulk parent id
            var parentRecId = soParent;

            //get the garndparent rec id from son record
            var parentRecObj = search.lookupFields({
                type: 'customrecord_bulk_sales_order',
                id: parentRecId,
                columns: ['custrecord_bo_so_parent','custrecord_bo_so_customer_order_no','custrecord_bo_so_sales_order']
            });

            log.debug('parentRecObj==',parentRecObj);

            var gparentRecId = parentRecObj.custrecord_bo_so_parent[0].value;
            var orderId = parentRecObj.custrecord_bo_so_customer_order_no;

            var gparentRecObj = search.lookupFields({
                type: 'customrecord_bulk',
                id: gparentRecId,
                columns: ['custrecord_bo_num','name','custrecord_bo_in_transit_location','custrecord_bo_to_location']
            });

            log.debug('gparentRecObj==',gparentRecObj);

            var itObj = record.create({
                type: record.Type.INVENTORY_TRANSFER,
                isDynamic: true
            });

            //set CUSTOMER ORDER NO
            itObj.setValue('custbody_customer_order_no',orderId);

            //set Bulk Order No
            itObj.setValue('custbody_tonal_bulk_order_no',gparentRecObj.custrecord_bo_num);

            //set BULK ORDER NUMBER List
            itObj.setValue('custbody_ns_bulk_order_no',gparentRecId);

            //set subsidiary
            itObj.setValue('subsidiary',1);//default

            //set trandate 
            itObj.setValue('trandate',new Date(date));

            //set sales order
            itObj.setValue('custbody_customer_so',parentRecObj.custrecord_bo_so_sales_order[0].value);

            //based on type parameter decide which date needs to stamp on bo sales order lines along with IT details
            if(type == 'delivery'){//intransit - doc

                //set type
                itObj.setValue('custbody_inventory_transfer_type',2);

                //set externalid
                itObj.setValue('externalid',gparentRecObj.custrecord_bo_num+'_'+orderId+'-D');

                //get the from location (intransit-location) from the BULK PARENT
                var fromloc = gparentRecObj.custrecord_bo_in_transit_location[0].value;

                //get the to location from the BULK PARENT
                var toloc = (gparentRecObj.custrecord_bo_to_location[0].text).toLowerCase();

                //check for the it include RYDER or XPO in the text
                var isXpo = toloc.includes('xpo');

                var isRyder = toloc.includes('ryder');

                if(isXpo == true){
                    toloc = 'XPO_Dock';
                }
                else if(isRyder == true){
                    toloc = 'Ryder_Dock';
                }

                log.debug('toloc==',toloc);

                //get the location by to location(externalid)
                var toLocId = getLocationByExternalId(toloc);
                //fail 
                if(typeof(toLocId) == 'object'){
                    return toLocId;
                }
                //sucess
                //set from location
                itObj.setValue('location',fromloc);

                //set tolocation
                itObj.setValue('transferlocation',toLocId);
            }

            if(type == 'receiving'){//doc - lmh

                //set type
                itObj.setValue('custbody_inventory_transfer_type',3);

                //set externalid
                itObj.setValue('externalid',gparentRecObj.custrecord_bo_num+'_'+orderId+'-R');

                //get the from location from the BULK PARENT
                var fromloc = (gparentRecObj.custrecord_bo_to_location[0].text).toLowerCase();

                //get the to location from the BULK PARENT
                var toloc = gparentRecObj.custrecord_bo_to_location[0].value;

                //check for the it include RYDER or XPO in the text
                var isXpo = fromloc.includes('xpo');

                var isRyder = fromloc.includes('ryder');

                if(isXpo == true){
                    fromloc = 'XPO_Dock';
                }
                else if(isRyder == true){
                    fromloc = 'Ryder_Dock';
                }

                log.debug('fromloc==',fromloc);

                //get the location by to location(externalid)
                fromloc = getLocationByExternalId(fromloc);
                //fail 
                if(typeof(fromloc) == 'object'){
                    return fromloc;
                }
                //sucess
                log.debug('fromloc=='+fromloc,'toloc=='+toloc);
                //set from location
                itObj.setValue('location',fromloc);

                //set tolocation
                itObj.setValue('transferlocation',toloc);
            }
            
            if(type == 'installation'){//lmh - pending activation

                //set type
                itObj.setValue('custbody_inventory_transfer_type',4);

                //set externalid
                itObj.setValue('externalid',gparentRecObj.custrecord_bo_num+'_'+orderId+'-I');

                //get the from location from the BULK PARENT
                var fromloc = gparentRecObj.custrecord_bo_to_location[0].value;

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
            }

            lineItemDetails = lineItemDetails;

            for(var x = 0 ; x < lineItemDetails.length ; x++){
                itObj.selectNewLine({
                    sublistId: 'inventory'
                });

                itObj.setCurrentSublistValue({
                    sublistId: 'inventory',
                    fieldId: 'item',
                    value: lineItemDetails[x].item
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
                return {message:'success',ns_inventory_transfer_id:Number(newITRecId),item_details:lineItemDetails,bulk_so_id:parentRecId};
            } 

        } catch (error) {
            log.error('Error : In Create IT In NetSuite',error);
            //check for the message string length
            var err = error.message;
            if(err.length > 290){
                err = error.name;
            }
            return{error:error.name,message:err};
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
                   search.createColumn({name: "phone", label: "Phone"}),
                   search.createColumn({name: "city", label: "City"}),
                   search.createColumn({name: "state", label: "State/Province"}),
                   search.createColumn({name: "country", label: "Country"}),
                   search.createColumn({name: "custrecordwoo_retail_store_key", label: "WooCommerce Retail Store KEY"}),
                   search.createColumn({name: "custrecord_so_dept", label: "Sales Department  "})
                ]
            });
            var searchResultCount = locationSearchObj.runPaged().count;
            log.debug("Location count",searchResultCount);
            var locId = '';
            locationSearchObj.run().each(function(result){
                locId = Number(result.id);
                return true;
            });
            return locId;
        } catch (error) {
            log.error('Error : In Get Location',error);
            return{error:error.name,message:error.message};
        }
    }

    //function to update the all so line grand childwith qty, IT,date
    function updateSoLinesRecord(recId,type,date,itId,itemDetails,messageId){
        try {
            var recObj = record.load({
                type: 'customrecord_bulk_sales_order',
                id:recId,
                isDynamic: true
            });

            var lineCount = recObj.getLineCount({
                sublistId: 'recmachcustrecord_bo_so_line_parent'
            });
            log.debug('bulkSoLineCount==',lineCount);
            
            for(var l = 0 ; l <lineCount ; l++){

                var nsItemId = recObj.getSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_item',
                    line: l
                });

                for(var x  = 0 ; x < itemDetails.length ; x++){
                    var iTItem = itemDetails[x].item;
                    //matched items
                    if(nsItemId == iTItem){
                        recObj.selectLine({
                            sublistId: 'recmachcustrecord_bo_so_line_parent',
                            line: l
                        });
        
                        if(type == 'delivery'){
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_delivered_qty',
                                value: itemDetails[x].qty
                            });
        
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_delivery_date',
                                value: new Date(date)
                            });
                            
                            if(itId){
                                recObj.setCurrentSublistValue({
                                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                                    fieldId: 'custrecord_bo_so_line_delivery_inv_trans',
                                    value: itId
                                });
                            }

                            /* recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_delivery_file_name',
                                value: messageId
                            }); */
                        }
                        if(type == 'receiving'){
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_received_qty',
                                value: itemDetails[x].qty
                            });
        
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_receipt_date',
                                value: new Date(date)
                            });

                            if(itId){
                                recObj.setCurrentSublistValue({
                                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                                    fieldId: 'custrecord_bo_so_line_receipt_inv_trans',
                                    value: itId
                                });
                            }

                            /* recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_receipt_file_name',
                                value: messageId
                            }); */
                        }
                        if(type == 'installation'){
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_installed_qty',
                                value: itemDetails[x].qty
                            });
        
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_installation_date',
                                value: new Date(date)
                            });
                            
                            if(itId){
                                recObj.setCurrentSublistValue({
                                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                                    fieldId: 'custrecord_bo_so_line_install_if',/* 'custrecord_bo_so_line_install_inv_trans' */
                                    value: itId
                                });
                            }
                            
                          /*   recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_install_file_name',
                                value: messageId
                            }); */
                        }

                        recObj.setCurrentSublistValue({
                            sublistId: 'recmachcustrecord_bo_so_line_parent',
                            fieldId: 'custrecord_bo_so_line_error_msg',
                            value: ''
                        });

                        recObj.commitLine({
                            sublistId:'recmachcustrecord_bo_so_line_parent'
                        });

                        break;
                    }
                }
            }
            var Id = recObj.save();
            if(Id){
                log.debug('So Lines Updated==',Id);
                return Number(Id);
            }
        } catch (error) {
            log.error('Error : In Update SoLinesRecord',error);
            return{error:error.name,message:error.message};
        }
    }

    //function to update the all so line with error
    function updateErrorSoLinesRecord(recId,type,date,itId,itemDetails,messageId,errorDetail){
        try {
            var recObj = record.load({
                type: 'customrecord_bulk_sales_order',
                id:recId,
                isDynamic: true
            });

            var lineCount = recObj.getLineCount({
                sublistId: 'recmachcustrecord_bo_so_line_parent'
            });
            log.debug('bulkSoLineCount==',lineCount);
            
            for(var l = 0 ; l <lineCount ; l++){
                var nsItemId = recObj.getSublistValue({
                    sublistId: 'recmachcustrecord_bo_so_line_parent',
                    fieldId: 'custrecord_bo_so_line_item',
                    line: l
                });

                for(var x  = 0 ; x < itemDetails.length ; x++){
                    var iTItem = itemDetails[x].item;
                    //matched items
                    if(nsItemId == iTItem){
                        recObj.selectLine({
                            sublistId: 'recmachcustrecord_bo_so_line_parent',
                            line: l
                        });

                        recObj.setCurrentSublistValue({
                            sublistId: 'recmachcustrecord_bo_so_line_parent',
                            fieldId: 'custrecord_bo_so_line_error_msg',
                            value: JSON.stringify(errorDetail)
                        });

                        /* if(type == 'delivery' && messageId != 'notupdate'){
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_delivery_file_name',
                                value: messageId
                            });
                        }

                        if(type == 'receiving' && messageId != 'notupdate'){
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_receipt_file_name',
                                value: messageId
                            });
                        }

                        if(type == 'installation' && messageId != 'notupdate'){
                            recObj.setCurrentSublistValue({
                                sublistId: 'recmachcustrecord_bo_so_line_parent',
                                fieldId: 'custrecord_bo_so_line_install_file_name',
                                value: messageId
                            });
                        } */

                        recObj.commitLine({
                            sublistId:'recmachcustrecord_bo_so_line_parent'
                        });

                        break;
                    }
                }
            }
            var recid = recObj.save();
            if(recid){
                log.debug('Record Updated With Error Details',recid);
            }
        } catch (error) {
            log.error('Error : In Update Error So Lines',error);
        }
    }

    //function to create the ITEM FULFILMENT
    function createItemFulfilment(boSoRecId,installationDate,items){
        try {
            
            var bulkSOObj = search.lookupFields({
                type: 'customrecord_bulk_sales_order',
                id: boSoRecId,
                columns: ['custrecord_bo_so_sales_order','custrecord_bo_so_parent','custrecord_bo_so_customer_order_no']
            });

            log.debug('IF Bulk SO Obj==',bulkSOObj);

            var salesOrderId = bulkSOObj.custrecord_bo_so_sales_order[0].value;

            var bulkObj = search.lookupFields({
                type: 'customrecord_bulk',
                id: bulkSOObj.custrecord_bo_so_parent[0].value,
                columns: ['custrecord_bo_to_location']
            });

            log.debug('IF Bulk Obj==',bulkObj);

            //get the trainer sku form the script parameter
            var scriptObj = runtime.getCurrentScript();
            var trainerSkus = scriptObj.getParameter('custscript_trainer_skus1');
            trainerSkus = trainerSkus.split(',');
            log.debug('trainerSkus=='+trainerSkus.length,trainerSkus);

            //first swap the item on SO the transform the SO for IF
            var soRec = record.load({
                type:'salesorder',
                id: salesOrderId
            });

            var soLineCount = soRec.getLineCount({sublistId:'item'});
            var lineChanged = false;
            
            var salesOrderLocation = soRec.getValue({
                fieldId: 'location'
            });

            // Swap Items On Sales Order As Needed
            // This is very hard-coded for now and can be changed later if needed
            // PRODUCTION
            var itemSwapObjT1 = {
                50: 1696,//T00001-1 : T00001-1-3
                1410: 1695,//T00001-1-2 : T00001-1-4
                1332: 52,//T00001.2 - T800 : T00001.2
                1343: 53,//T00001.4 - T800 : T00001.4
            }
            var itemSwapObjT800 = {
                1696: 50,
                1695: 1410,
                52: 1332,
                53: 1343,
            }
            
           /*  50 - T00001-1
            52 - T00001.2
            53 - T00001.4
            1332 - T00001.2 - T800
            1343 - T00001.4 - T800
            1713 - TL Halter High Neck Bra XS S M L XL 26 60 60 50 4-Navy */

            //get the bulkso lines
            var bulkSoLineCount = soRec.getLineCount('recmachcustrecord_bo_so_line_so_parent');
            log.debug('bulkSoLineCount==',bulkSoLineCount);
            var boSoItems = [];
            for(var bosol = 0 ; bosol < bulkSoLineCount ; bosol++){
                var trainer = (soRec.getSublistText('recmachcustrecord_bo_so_line_so_parent','custrecord_bo_so_line_item',bosol)).toUpperCase();
                if(trainer.includes('TRAINER')){
                    boSoItems.push({
                        item_id:soRec.getSublistValue('recmachcustrecord_bo_so_line_so_parent','custrecord_bo_so_line_item',bosol),
                        member_item:search.lookupFields({type: search.Type.ITEM,id: soRec.getSublistValue('recmachcustrecord_bo_so_line_so_parent','custrecord_bo_so_line_item',bosol),columns: ['itemid']}).itemid
                    });
                }
            }

            log.debug('boSoItems=='+boSoItems.length,boSoItems);

            for (var i = 0; i < soLineCount; i++) {
                var cItem = soRec.getSublistValue({sublistId:'item',fieldId:'item',line:i});
                var curAmount = soRec.getSublistValue({sublistId: 'item', fieldId: 'amount', line: i});
                var curQuantity = soRec.getSublistValue({sublistId: 'item', fieldId: 'quantity', line: i});
                var curRate = soRec.getSublistValue({sublistId: 'item', fieldId: 'rate', line: i});

                // log.debug({title:'CItem', details: cItem});
                if ([50,52,53,1332,1343,1713].indexOf(parseInt(cItem)) > -1) {
                    // log.debug({title:'Is In Array', details:'IN ARRAY'});

                    //check item conatins member sku of trainer or not if not, if matching now SO item swap else SO item Swap based on below criteria
                    //then check for the which trainer sku is not matching from the script parmeter trainer skus and item's member skus
                    var sku = '';
                    
                    var itemMembers = getItemMemberTrainerSku(cItem,false);
                    log.debug('itemMembers=='+itemMembers.length,itemMembers);

                    //s1. check item member conatins member trainer sku matches with boso line trainer sku
                    var trainerSkuMathces = getMatchedSku(itemMembers,boSoItems);
                    log.debug('trainerSkuMathces=='+trainerSkuMathces.length,trainerSkuMathces);

                    if(trainerSkuMathces.length == 0){

                        //s2. check which trainer sku not matches
                        var indexT1 = boSoItems.findIndex(function(obj){
                            return obj.member_item == trainerSkus[0];
                        });

                        var indexT2 = boSoItems.findIndex(function(obj){
                            return obj.member_item == trainerSkus[1];
                        });

                        if(indexT1 != -1){
                            sku = trainerSkus[0];
                        }
                        else if(indexT2 != -1){
                            sku = trainerSkus[1];
                        }

                        log.debug('sku==',sku);

                        if (sku == trainerSkus[0]){
                            // log.debug({title:'SKU is 100-0001', details:sku});
                            if (itemSwapObjT1.hasOwnProperty(cItem)) {
                                // log.debug({title:'Swapping Item', details:'Swapping'});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'item', line: i, value: itemSwapObjT1[cItem]});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'quantity', line: i, value: curQuantity});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'rate', line: i, value: curRate});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'amount', line: i, value: curAmount});
                                lineChanged = true;
                            }
                        } else if (sku == trainerSkus[1]) {
                            // log.debug({title:'SKU is 100-0002', details:sku});
                            if (itemSwapObjT800.hasOwnProperty(cItem)) {
                                // log.debug({title:'Swapping Item', details:'Swapping'});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'item', line: i, value: itemSwapObjT800[cItem]});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'quantity', line: i, value: curQuantity});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'rate', line: i, value: curRate});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'amount', line: i, value: curAmount});
                                lineChanged = true;
                            }
                        }

                    }
                }
            }

            log.debug('SOLINECHANGED==',lineChanged);

            // Save SO only if line was changed
            if (lineChanged) {
                var soId = soRec.save({ignoreMandatoryFields: true});
                if(soId){
                    log.debug('Sales Order Updated With Line Swapping',soId);
                }
            }
            
            var ifObj = record.transform({
                fromType: record.Type.SALES_ORDER,
                fromId: salesOrderId,
                toType: record.Type.ITEM_FULFILLMENT,
                isDynamic: true
            });

            //set trandate 
            ifObj.setText('trandate',installationDate);

            //set sales order location
            ifObj.setValue({fieldId:'custbody_sales_order_location',value: salesOrderLocation}); // Set Sales Order Location for Retail P&L GL Plugin

            //set memo
            ifObj.setValue({fieldId: 'memo', value: bulkSOObj.custrecord_bo_so_customer_order_no});

            var ifLineCount = ifObj.getLineCount('item');
            log.debug('ifLineCount==',ifLineCount);
            for(var i = 0 ; i < ifLineCount ; i++){
                ifObj.selectLine({
                    sublistId: 'item',
                    line:i
                });

                //set receive true
                ifObj.setCurrentSublistValue('item','itemreceive',true);
                
                //set location
                ifObj.setCurrentSublistValue('item','location',bulkObj.custrecord_bo_to_location[0].value);

                ifObj.commitLine('item');

            }

            var newIfId = ifObj.save();
            if(newIfId){
                log.debug('IF Created For SO#'+salesOrderId,'IF#'+newIfId);
                return {message:'success',ns_itemfulfilment_id:Number(newIfId),item_details:items,bulk_so_id:boSoRecId,sales_order_line_changed:lineChanged};
            }

        } catch (error) {
            log.error('Error : In Create IF In NetSuite',error);
            //check for the message string length
            var err = error.message;
            if(err.length > 290){
                err = error.name;
            }
            return{error:error.name,message:err};
        }
    }

    //function to get the trainer member item
    function getItemMemberTrainerSku(itemId,isRyderOrder){
        try {
            var itemSearchObj = search.create({
                type: "item",
                filters:
                [
                   ["internalid","anyof",itemId], 
                   "AND", 
                   ["isinactive","is","F"], 
                   /* "AND", 
                   ["memberitem.name","is","100-0002"] */
                ],
                columns:
                [
                   search.createColumn({
                      name: "itemid",
                      sort: search.Sort.ASC,
                      label: "Name"
                   }),
                   search.createColumn({name: "displayname", label: "Display Name"}),
                   search.createColumn({name: "type", label: "Type"}),
                   search.createColumn({name: "memberitem", label: "Member Item"}),
                   search.createColumn({
                      name: "itemid",
                      join: "memberItem",
                      label: "Name"
                   })
                ]
            });
            var searchResultCount = itemSearchObj.runPaged().count;
            log.debug("Item Meber Count For Item# "+itemId,searchResultCount);
            var data = [];
            itemSearchObj.run().each(function(result){
                if(isRyderOrder == true){
                    data.push({item_id:itemId,member_item_id:result.getValue({name: "memberitem"}),member_item:result.getValue({name: "itemid",join: "memberItem"}),SKU_Code:result.getValue({name: "itemid",join: "memberItem"}),SKU_Name:result.getValue({name: "itemid",join: "memberItem"})})
                }
                else{
                    data.push({item_id:itemId,member_item_id:result.getValue({name: "memberitem"}),member_item:result.getValue({name: "itemid",join: "memberItem"})})
                }
                return true;
            });
            return data;
        } catch (error) {
            log.error('Error: In Get Item Member Trainer SKU',error);
            return [];
        }
    }

    //function to get the array of object by comparing 2 arary of object
    function getMatchedSku(itemArray1, itemArray2){
        try {
            var props = ['item_id', 'member_item','member_item_id'];

            var result = itemArray1.filter(function(o1){
                return itemArray2.some(function(o2){
                return o1.member_item === o2.member_item;        
                });
            }).map(function(o){
                return props.reduce(function(newo, name){
                newo[name] = o[name];
                return newo;
                }, {});
            });
            return result;
        } catch (error) {
            log.error('Error : In Get Matched Sku',error);
            return [];
        }
    }

    return {
        getInputData: getInputData,
        map: map
    }
});
