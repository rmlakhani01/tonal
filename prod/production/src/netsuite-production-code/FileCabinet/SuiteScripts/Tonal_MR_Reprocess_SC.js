/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Reprocess SC
 * File Name   : Tonal_MR_Reprocess_SC.js
 * Description : This script is used for SC reporcess from the selected suitelet sublist data
 * Created On  : 24/03/2023
 * Modification Details: 
 * Version       By               Instance                Date                        Description
 * V1            Vikash           SB1                     03/04/2023                  Updated logic for error message not clearing while sucess process 
 * V2            Vikash           SB1                     12/04/2023                  modification for splitting skus
 * V3            Vikash           SB2                     25/04/2023                  modification for handling "B"and "C" suffix orders
 * V4            Vikash           SB2                     26/04/2023               modification for handling any alphabets suffic in orders
 ************************************************************/
define(["N/runtime","N/search","N/record","N/format"], function(runtime,search,record,format) {

    function getInputData() {
        try {
            var scriptObj = runtime.getCurrentScript();
            var data = scriptObj.getParameter('custscript_sc_reprocess_data');
            log.debug('data==',data);
            if(!data){
                return [];
            }
            return JSON.parse(data);
        } catch (error) {
            log.error('Error : In Input Stage',error);
            return [];
        }
    }

    function map(context) {
        try {
            var data = JSON.parse(context.value);
            var key = context.key;
            var scStgRecId = data.sc_stg_rec_id;
            var scStgRecName = data.sc_stg_rec_name;
            var scStgStatus = data.sc_stg_status;
            var scStgError = data.sc_stg_error;
            var scStgPd = data.sc_stg_pd;
            var scStgFilename = data.sc_stg_file_name;
            var scStagingCd = data.sc_stg_cd; 
            log.debug('processing sc-stg||'+scStgRecId,'scStgRecName=='+scStgRecName);

            var header,stgLines,bulkSoLines,salesOrder,stageSCLines,filename = scStgFilename,stageId = scStgRecId;

            //get the header, line details form sc_stg
            var scStgObj = search.lookupFields({
                type: 'customrecord_ship_confirm_staging',
                id: scStgRecId,
                columns: ['custrecord_stg_sc_header','custrecord_stg_sc_lines','custrecord_stg_sc_file_name']
            });

            // log.debug('scStgObj==',scStgObj);
     
            if (typeof(JSON.parse(scStgObj.custrecord_stg_sc_header)) === 'object'){
                header = JSON.parse(scStgObj.custrecord_stg_sc_header);
            }
            if (typeof JSON.parse(scStgObj.custrecord_stg_sc_lines === 'string')){
                stgLines = JSON.parse(scStgObj.custrecord_stg_sc_lines);
            } 

            // log.debug('header==',header);
            // log.debug('stgLines==',stgLines);

            var id;
            var pattern = /[A-z]/g;
            if(header['Distribution_Center'].startsWith('EXT') === true){
                //first check 'PICK_NUMBER' conatin charecter 'A' or not if yes then it's updated shipped details,else continue normal
                //contains "A","B","C" suffix
                /* if(header['Delivery_ID'].startsWith('A',header['Delivery_ID'].length-1) === true){
                  id = header['PICK_NUMBER'];
                }
                else if(header['Delivery_ID'].startsWith('B',header['Delivery_ID'].length-1) === true){
                    id = header['PICK_NUMBER'];
                }
                else if(header['Delivery_ID'].startsWith('C',header['Delivery_ID'].length-1) === true){
                    id = header['PICK_NUMBER'];
                }
                else{
                  id = header['Delivery_ID'].replace(/\D/g, '');
                } */
                //alphabets avilable in orderid
                if(header['Delivery_ID'].match(pattern) != null){
                    log.debug('ALPHABETS AVILABLE IN ORDER ID','WORKING..||'+header['Delivery_ID']);
                    id = header['Delivery_ID'];
                }
                //alphabets not avilable in orderid
                else{
                    log.debug('ALPHABETS NOT AVILABLE IN ORDER ID','WORKING..||'+header['Delivery_ID']);
                    id = header['Delivery_ID'];
                }
                salesOrder = fetchBulkSalesOrder(id);
                bulkSoLines = fetchBulkSalesOrderLines(id);
                stageSCLines = extractExtronItems(stgLines);
                stageSCLines = removePhantomSKUs(stageSCLines);
            }
        
            if(header['Distribution_Center'].startsWith('GIL') === true){
                //first check 'PICK_NUMBER' conatin charecter 'A' or not if yes then it's updated shipped details,else continue normal
                //contains "A","B","C" suffix
               /*  if(header['PICK_NUMBER'].startsWith('A',header['PICK_NUMBER'].length-1) === true){
                    id = header['PICK_NUMBER'];
                }
                else if(header['PICK_NUMBER'].startsWith('B',header['PICK_NUMBER'].length-1) === true){
                    id = header['PICK_NUMBER'];
                }
                else if(header['PICK_NUMBER'].startsWith('C',header['PICK_NUMBER'].length-1) === true){
                    id = header['PICK_NUMBER'];
                }
                else{
                    id = header['PICK_NUMBER'].replace(/\D/g, '');
                } */
                //alphabets avilable in orderid
                if(header['PICK_NUMBER'].match(pattern) != null){
                    log.debug('ALPHABETS AVILABLE IN ORDER ID','WORKING..||'+header['PICK_NUMBER']);
                    id = header['PICK_NUMBER'];
                }
                //alphabets not avilable in orderid
                else{
                    log.debug('ALPHABETS NOT AVILABLE IN ORDER ID','WORKING..||'+header['PICK_NUMBER']);
                    id = header['PICK_NUMBER'];
                }
                salesOrder = fetchBulkSalesOrder(id);
                bulkSoLines = fetchBulkSalesOrderLines(id);
                stageSCLines = extractGilbertItems(stgLines);
                let tempItems = checkPhantomSkus(stageSCLines);
                if (tempItems.length > 0) {
                    stageSCLines = updateGilbertItems(stageSCLines);
                    log.debug('updateGilbertItems==',stageSCLines);
                    var finalItems = [];
                    for(var c in stageSCLines){
                        var data = stageSCLines[c].splited_item;
                        if(data == undefined){
                            finalItems.push(stageSCLines[c]);
                        }else{
                            for(var k in data){
                                finalItems.push(data[k]);
                            }
                        }
                    }  
                    stageSCLines = finalItems;
                }
            }

            stageSCLines = shipConfirmItems(stageSCLines);

            log.debug('id==',id);
            log.debug('salesOrder==',salesOrder);
            log.debug('bulkSoLines==',bulkSoLines);
            log.debug('stageSCLines==',stageSCLines);

            var key = header['BULK_ID']? header['BULK_ID']: header['Order_Number'];

            if (salesOrder.length > 0 && bulkSoLines.length > 0 && stageSCLines.length > 0) {
                context.write({
                    key: key,
                    value: {header,stgLines,salesOrder,bulkSoLines,stageSCLines,filename,stageId},
                });
            } 
            else {
                log.debug('STAGE SHIP CONFIRM RECORD ID WITHOUT ORDER INFORMATION IN NETSUITE',scStgRecId);
                var errMessage;
                if(salesOrder.length == 0){
                    errMessage = {message:'Bulk Sales Order Not Avilable',order_id:id}
                }
                else if(bulkSoLines.length == 0){
                    errMessage = {message:'Bulk Sales Order Lines Not Avilable',order_id:id}
                }
                else if(stageSCLines.length == 0){
                    errMessage = {message:'Bulk Sales Order Lines Items Not Avilable',order_id:id}
                }
                log.debug('Staging Record Updating With Error..');
                record.submitFields({
                    type: 'customrecord_ship_confirm_staging',
                    id: scStgRecId,
                    values: {
                        custrecord_stg_sc_status: 4,
                        custrecord_stg_sc_process_date: new Date(),
                        custrecord_stg_sc_error_message: JSON.stringify(errMessage),
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true,
                    },
                });
                log.debug('SHIPCONFIRM STAGING PROCESSED UNSUCCESSFULLY-1-!!',scStgRecId);
            }
        } catch (error) {
            log.error('Error : In Map Stage',error);
        }
    }

    function reduce(context) {
        try {
            let orders = context.values;
            let shipInvXferId;
            orders.forEach((order) => {
                order = JSON.parse(order);
                let shipDate, itemsToBeUpdated;

                order.header['Distribution_Center'].startsWith('GIL')? (shipDate = order.header['SHIP_DATE']): (shipDate = order.stgLines[0]['Ship_Date']);

                let output = compareScToBulk(order.stageSCLines,order.bulkSoLines);

                // log.debug('stageScLines', order.stageSCLines);
                // log.debug('bulkSoLines', order.bulkSoLines);

                let finalOutput = compareBulkToSc(order.stageSCLines,order.bulkSoLines,output);
                log.debug('finalOutput', finalOutput)

                let overage = finalOutput.filter((result) => result.qty >= 1);
                let success = finalOutput.filter((result) => result.qty === 0);
                let shortage = finalOutput.filter((result) => result.qty < 0);

                log.debug('overage', overage);
                log.debug('success', success);
                log.debug('shortage', shortage);

                if (success.length > 0 || shortage.length > 0) {
                    itemsToBeUpdated = extractItems(order.stageSCLines,order.bulkSoLines);
                }

                log.debug('itemsToBeUpdated', itemsToBeUpdated);

                //overrage
                if (overage.length > 0) {
                    failedStagingRecord(order.stageId,4,'ITEMS OR QUANTITY MISMATCH');
                    log.debug('SHIPCONFIRM STAGING PROCESSED UNSUCCESSFULLY-2-!!',order.stageId);
                    return;
                }

                //shortage
                if (overage.length === 0 && shortage.length > 0) {
                    shipInvXferId = addShipInventoryTransfer(order.stageSCLines,shipDate,order.salesOrder,order.header);
                    if (typeof(shipInvXferId) == 'number') {
                        updateBulkSoLines(shipInvXferId,shipDate,order.bulkSoLines,order.stageSCLines,itemsToBeUpdated,order.filename,order.salesOrder);
                        updateStagingShipConfirm(order.salesOrder,shipInvXferId,order.stageId,3,'ERROR MISSING ITEM OR QUANTITY');
                    }
                    //update staging with error
                    else if(typeof(shipInvXferId) == 'object'){
                        updateBulkSoLines('',shipDate,order.bulkSoLines,order.stageSCLines,itemsToBeUpdated,order.filename,order.salesOrder);
                        updateStagingShipConfirm(order.salesOrder,'',order.stageId,4,JSON.stringify(shipInvXferId[0]));
                    }
                    log.debug('SHIPCONFIRM STAGING PROCESSED UNSUCCESSFULLY-3-!!',order.stageId);
                }

                // success
                if (overage.length === 0 && shortage.length === 0 && success.length > 0) {
                    shipInvXferId = addShipInventoryTransfer(order.stageSCLines,shipDate,order.salesOrder,order.header);
                    if (typeof(shipInvXferId) == 'number') {
                        updateBulkSoLines(shipInvXferId,shipDate,order.bulkSoLines,order.stageSCLines,itemsToBeUpdated,order.filename,order.salesOrder);
                        updateStagingShipConfirm(order.salesOrder,shipInvXferId,order.stageId,2,null);
                    }
                    //update staging with error
                    else if(typeof(shipInvXferId) == 'object'){
                        updateBulkSoLines('',shipDate,order.bulkSoLines,order.stageSCLines,itemsToBeUpdated,order.filename,order.salesOrder);
                        updateStagingShipConfirm(order.salesOrder,'',order.stageId,4,JSON.stringify(shipInvXferId[0]));
                    }
                    log.debug('SHIPCONFIRM STAGING PROCESSED SUCCESSFULLY!!',order.stageId);
                }
            });
        } catch (error) {
            log.error('Error : In Reduce Stage',error);
        }
    }

    const fetchBulkSalesOrder = (deliveryId) => {
    try {
        const salesOrders = []
        search
        .create({
            type: 'customrecord_bulk_sales_order',
            filters: [
            {
                name: 'custrecord_bo_so_customer_order_no',
                operator: search.Operator.IS,
                values: [deliveryId],
            },
            {
                name: 'isinactive',
                operator: search.Operator.IS,
                values: false,
            },
            ],
            columns: [
            { name: 'internalid' },
            { name: 'name' },
            { name: 'custrecord_bo_so_parent' },
            { name: 'custrecord_bo_so_customer_order_no' },
            {
                name: 'custrecord_bo_from_location',
                join: 'CUSTRECORD_BO_SO_PARENT',
            },
            {
                name: 'custrecord_bo_in_transit_location',
                join: 'CUSTRECORD_BO_SO_PARENT',
            },
            {
                name: 'internalid',
                join: 'CUSTRECORD_BO_SO_PARENT',
            },
            {
                name: 'custrecord_bo_carrier',
                join: 'CUSTRECORD_BO_SO_PARENT',
            },
            {
                name: 'custrecord_bo_so_sales_order'
            }
            ],
        })
        .run()
        .each((salesOrder) => {
            let order = {
            id: salesOrder.getValue({ name: 'internalid' }),
            name: salesOrder.getValue({ name: 'name' }),
            order: salesOrder.getValue({
                name: 'custrecord_bo_so_customer_order_no',
            }),
            bulk: salesOrder.getValue({
                name: 'custrecord_bo_so_parent',
            }),
            from: salesOrder.getValue({
                name: 'custrecord_bo_from_location',
                join: 'CUSTRECORD_BO_SO_PARENT',
            }),
            to: salesOrder.getValue({
                name: 'custrecord_bo_in_transit_location',
                join: 'CUSTRECORD_BO_SO_PARENT',
            }),
            bulkId: salesOrder.getValue({
                name: 'internalid',
                join: 'CUSTRECORD_BO_SO_PARENT',
            }),
            carrier:{name:salesOrder.getText({name: 'custrecord_bo_carrier',join: 'CUSTRECORD_BO_SO_PARENT'}),id:salesOrder.getValue({name: 'custrecord_bo_carrier',join: 'CUSTRECORD_BO_SO_PARENT'})},//by vikash
            ns_so_id:salesOrder.getValue({
                name: 'custrecord_bo_so_sales_order'
            })
            }
            salesOrders.push(order)
            return true
        })

        return salesOrders
    } catch (e) {
        log.debug('ERROR - FETCH_BULK_SALES_ORDER', e)
    }
    }
    
    const fetchBulkSalesOrderLines = (deliveryId) => {
    try {
        const lines = []
        search
        .create({
            type: 'customrecord_bulk_order_so_lines',
            filters: [
            {
                name: 'name',
                operator: search.Operator.CONTAINS,
                values: [deliveryId],
            },
            ],
            columns: [
            { name: 'internalid' },
            { name: 'name' },
            { name: 'custrecord_bo_so_line_item' },
            { name: 'custrecord_bo_so_line_released_qty' },
            ],
        })
        .run()
        .each((bulkLine) => {
            let line = {
            id: bulkLine.getValue({ name: 'internalid' }),
            name: bulkLine.getValue({ name: 'name' }),
            item: bulkLine.getValue({
                name: 'custrecord_bo_so_line_item',
            }),
            itemName: bulkLine.getText({
                name: 'custrecord_bo_so_line_item',
            }),
            qty: parseInt(
                bulkLine.getValue({
                name: 'custrecord_bo_so_line_released_qty',
                }),
            ),
            }
            lines.push(line)
            return true
        })

        return lines
    } catch (e) {
        log.debug('ERROR - FETCH_BULK_SALES_ORDER_LINES', e)
    }
    }
    
    const extractExtronItems = (stgLines) => {
    try {
        const lines = []
        stgLines.forEach((line) => {
        lines.push({
            item: line['Ordered_Item'],
            shipDate: line['Ship_Date'],
            serial: line['Serial_Number1'],
            serial2: line['Serial_Number2'],
            serial3: line['Serial_Number3'],
            qty: parseInt(line['Box_Qty']),
        })
        })

        return lines
    } catch (e) {
        log.debug('ERROR - EXTRACT_EXTRON_ITEMS')
    }
    }
    
    const extractGilbertItems = (stgLines) => {
    try {
        const lines = []
        stgLines.forEach((line) => {
        lines.push({
            item: line['STYLE'],
            shipDate: line['ORDER_NUMBER'].split('-')[0],
            serial: line['SERIAL_NUMBER'],
            qty: parseInt(line['QUANTITY_SHIPPED']),
        })
        })

        return lines
    } catch (e) {
        log.debug('ERROR - EXTRACT_GILBERT_ITEMS', e)
    }
    }
    
    const updateGilbertItems = (lines) => {
    let output = []

    lines.forEach((line, index) => {
        if (line.item !== '150-0001' || line.item !== '160-0001')
        output.push(line)

        if (line.item === '150-0001') {
        output.splice(index)
        output.push({
            item: '150-0024',
            qty: line.qty,
        })
        }

        if (line.item === '160-0001') {
            output.splice(index,1,{splited_item:[{ item: '160-0003', qty: line.qty },{ item: '121-0006', qty: line.qty },{ item: '121-0007', qty: line.qty }]})
        }
    })
    return output
    }
    
    const removePhantomSKUs = (lines) => {
        return lines.filter((line) => {
            if (line.item !== '160-0001' && line.item !== '150-0001')
            return line.item
        })
    }
    
    const addShipInventoryTransfer = (
    stageSCLines,
    shipDate,
    salesOrder,
    header,
    ) => {
        try {
            log.debug('stageSCLines For IT==',stageSCLines);
            let items = stageSCLines.filter((lines) => lines.qty !== 0)
        
            let orderNumber, eID
            if (header['Distribution_Center'].startsWith('EXT') === true) {
                orderNumber = header['Order_Number']
                eID =
                header['Order_Number'] + '_' + header['Delivery_ID'] + '_S'
            } else {
                eID = header['BULK_ID'] + '_' + header['PICK_NUMBER'] + '_S'
                orderNumber = header['BULK_ID']
            }
        
            let inventoryTransfer = record.create({
                type: record.Type.INVENTORY_TRANSFER,
                isDynamic: true,
            })
        
            inventoryTransfer.setValue({ fieldId: 'subsidiary', value: 1 })
            inventoryTransfer.setValue({ fieldId: 'externalid', value: eID })
        
            let dateShipped = formatDate(shipDate)
            inventoryTransfer.setValue({
                fieldId: 'trandate',
                value: dateShipped,
            })
        
            inventoryTransfer.setValue({
                fieldId: 'location',
                value: salesOrder[0].from,
            })
        
            inventoryTransfer.setValue({
                fieldId: 'transferlocation',
                value: salesOrder[0].to,
            })
        
            inventoryTransfer.setValue({
                fieldId: 'custbody_customer_order_no',
                value: salesOrder[0].order,
            })
        
            inventoryTransfer.setValue({
                fieldId: 'custbody_tonal_bulk_order_no',
                value: orderNumber,
            })
        
            inventoryTransfer.setValue({
                fieldId: 'custbody_inventory_transfer_type',
                value: 1,
            })
        
            inventoryTransfer.setValue({
                fieldId: 'custbody_ns_bulk_order_no',
                value: salesOrder[0].bulkId,
            })
        
            inventoryTransfer.setValue({
                fieldId: 'custbody_customer_so',
                value: salesOrder[0].ns_so_id,
            })
        
            items.forEach((item) => {
                inventoryTransfer.selectNewLine({ sublistId: 'inventory' })
                inventoryTransfer.setCurrentSublistValue({
                sublistId: 'inventory',
                fieldId: 'item',
                value: item.details[0].id,
                })
                inventoryTransfer.setCurrentSublistValue({
                sublistId: 'inventory',
                fieldId: 'adjustqtyby',
                value: item.qty,
                })
                inventoryTransfer.commitLine({ sublistId: 'inventory' })
            })
        
            let transfers = checkInventoryTransfer(eID)
            log.debug('transfers', transfers)
        
            let inventoryTransferId
        
            if (transfers && transfers.length === 1) {
                inventoryTransferId = transfers[0].id
            } else if (transfers.length === 0) {
                inventoryTransferId = inventoryTransfer.save()
            }
        
            return Number(inventoryTransferId)
        } catch (error) {
            log.error('Error : In Add Inventory Transfer',error);
            var e = error.message;
            if(e.length > 300){
                e = e.split('.')[0];
            }
            return [{error:error.name,message:e}];
        }
    }
    
    const updateBulkSoLines = (
    shipInvXferId,
    shipDate,
    bulkSoLines,
    stageSCLines,
    itemsToBeUpdated,
    filename,
    salesOrder
    ) => {
    try {
        itemsToBeUpdated.forEach((item) => {
        let bulkSo = record.load({
            type: 'customrecord_bulk_order_so_lines',
            id: item.id,
            isDynamic: true,
        })

        let serializedItem = stageSCLines.filter(
            (line) => line.item === '100-0002' && line.serial !== '',
        )

        if (serializedItem.length > 0) {
            if (item.item === serializedItem[0]['item']) {
            bulkSo.setValue({
                fieldId: 'custrecord_bo_so_line_serial_num',
                value: serializedItem[0]['serial'],
            })
            }
        }

        bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_shipped_qty',
            value: item.qty,
        })

        if(shipInvXferId){
            bulkSo.setValue({
                fieldId: 'custrecord_bo_so_line_ship_inv_trans',
                value: shipInvXferId,
            })
        }

        let dateShipped = formatDate(shipDate)
        bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_ship_date',
            value: dateShipped,
        })

        bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_ship_file_name',
            value: filename,
        })

        bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_status_dynamic',
            value: 1,
        })

        //if carrier is "Flagship Will Call" or "Will Call" update dilevery and receipt information with same IT for SC
        if(salesOrder[0].carrier.name == 'Flagship Will Call' || salesOrder[0].carrier.name == 'Will Call' || salesOrder[0].carrier.name == 'XPO'){
            //delivery data update
            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_delivered_qty',
            value: item.qty,
            })

            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_delivery_inv_trans',
            value: shipInvXferId,
            })

            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_delivery_date',
            value: formatDate(shipDate),
            })

            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_delivery_file_name',
            value: filename,
            })

            //receipt data update
            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_received_qty',
            value: item.qty,
            })

            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_receipt_inv_trans',
            value: shipInvXferId,
            })

            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_receipt_date',
            value: formatDate(shipDate),
            })

            bulkSo.setValue({
            fieldId: 'custrecord_bo_so_line_receipt_file_name',
            value: filename,
            })
        }

        bulkSo.save()
        })
    } catch (e) {
        log.debug('ERROR -UPDATE BULK SO LINES', e)
    }
    }
    
    const updateStagingShipConfirm = (
    salesOrder,
    shipInvXferId,
    stageId,
    status,
    reason,
    ) => {
    log.debug('salesOrder', salesOrder)
    log.debug('shipInvXferId', shipInvXferId)
    log.debug('stageId', stageId)

    let stageRecord = record.load({
        type: 'customrecord_ship_confirm_staging',
        id: stageId,
        isDynamic: true,
    })

    stageRecord.setValue({
        fieldId: 'custrecord_stg_sc_status',
        value: status,
    })
    if(shipInvXferId){
        stageRecord.setValue({
            fieldId: 'custrecord_stg_sc_inventory_transfer',
            value: shipInvXferId,
        })
    }
    stageRecord.setValue({
        fieldId: 'custrecord_stg_sc_process_date',
        value: new Date(),
    })
    stageRecord.setValue({
        fieldId: 'custrecord_stg_sc_bo_so',
        value: salesOrder[0].id,
    })
    if (reason) {
        stageRecord.setValue({
        fieldId: 'custrecord_stg_sc_error_message',
        value: reason,
        })
    }
    else{
        stageRecord.setValue({
            fieldId: 'custrecord_stg_sc_error_message',
            value: '',
        })
    }
    stageRecord.save()
    }
    
    const failedStagingRecord = (stageId, status, reason) => {
    let stgRec = record.load({
        type: 'customrecord_ship_confirm_staging',
        id: stageId,
        isDynamic: true,
    })
    stgRec.setValue({
        fieldId: 'custrecord_stg_sc_status',
        value: status,
    })
    stgRec.setValue({
        fieldId: 'custrecord_stg_sc_error_message',
        value: '[' + new Date() + '] - ERROR: ' + reason,
    })
    stgRec.setValue({
        fieldId: 'custrecord_stg_sc_process_date',
        value: new Date(),
    })
    stgRec.save()
    }
    
    const checkInventoryTransfer = (externalid) => {
    try {
        const transfers = []
        search
        .create({
            type: search.Type.TRANSACTION,
            filters: [
            {
                name: 'type',
                operator: search.Operator.ANYOF,
                values: ['InvTrnfr'],
            },
            {
                name: 'externalidstring',
                operator: search.Operator.IS,
                values: [externalid],
            },
            {
                name: 'mainline',
                operator: search.Operator.IS,
                values: true,
            },
            ],
            columns: [{ name: 'internalid' }],
        })
        .run()
        .each((transfer) => {
            transfers.push({
            id: transfer.getValue({ name: 'internalid' }),
            })
            return true
        })

        return transfers
    } catch (e) {
        log.debug('checkInventoryTransfer', e)
    }
    }
    
    const formatDate = (input) => {
    switch (input.length) {
        case 6:
        case 8:
        let temp = new Date(
            input.slice(4, 6) +
            '-' +
            input.slice(6, 8) +
            '-' +
            input.slice(0, 4),
        )
        let out = format.parse({
            value: temp,
            type: format.Type.DATE,
        })
        return out
        case 11:
        let temp1 = new Date(input)
        let output = format.parse({
            value: temp1,
            type: format.Type.DATE,
        })
        return output
    }
    }
    
    const getItemDetails = (sku) => {
    const items = []
    search
        .create({
        type: search.Type.ITEM,
        filters: [
            {
            name: 'name',
            operator: search.Operator.IS,
            values: [sku],
            },
            {
            name: 'isinactive',
            operator: search.Operator.IS,
            values: false,
            },
        ],
        columns: [{ name: 'internalid' }, { name: 'name' }],
        })
        .run()
        .each((item) => {
        let sku = {
            id: item.getValue({ name: 'internalid' }),
            name: item.getValue({ name: 'name' }),
        }
        items.push(sku)
        return true
        })

    return items
    }
    
    const shipConfirmItems = (items) => {
    let shipItems = items.map((i) => i.item)
    let shipConfirmItems = items.filter(
        ({ item }, index) => !shipItems.includes(item, index + 1),
    )

    shipConfirmItems.forEach((item) => {
        item.details = [...getItemDetails(item.item)]
    })

    return shipConfirmItems
    }
    
    const checkPhantomSkus = (stageScLines) => {
    let temp1 = stageScLines.filter(
        (line) => line.item === '150-0001',
    )
    let temp2 = stageScLines.filter(
        (line) => line.item === '160-0001',
    )

    return [...temp1, ...temp2]
    }
    
    const compareScToBulk = (stageScLines, bulkSoLines) => {
    var results = []
    for (var i = 0; i < stageScLines.length; i += 1) {
        var array = bulkSoLines.filter(
        (bulkLine) => bulkLine.itemName === stageScLines[i].item,
        )

        // Matching Items
        if (array.length > 0) {
        // with Matching Quantities
        if (stageScLines[i].qty === array[0].qty) {
            results.push({
            item: stageScLines[i].item,
            qty: stageScLines[i].qty - array[0].qty,
            })
            //without matching quantities
        } else {
            results.push({
            item: stageScLines[i].item,
            qty: stageScLines[i].qty - array[0].qty,
            })
        }
        // items that are missing
        } else {
        results.push({
            item: stageScLines[i].item,
            qty: stageScLines[i].qty,
        })
        }
    }

    return results
    }
    
    const compareBulkToSc = (stageScLines, bulkSoLines, results) => {
    for (var i = 0; i < bulkSoLines.length; i += 1) {
        var array = stageScLines.filter(
        (stageScLines) =>
            stageScLines.item === bulkSoLines[i].itemName,
        )
        if (array.length === 0) {
        results.push({
            item: bulkSoLines[i].itemName,
            qty: -bulkSoLines[i].qty,
        })
        }
    }
    return results
    }
    
    const extractItems = (stageScLines, bulkSoLines) => {
    var tobeUpdated = []
    for (var i = 0; i < stageScLines.length; i += 1) {
        let bulkItems = bulkSoLines.filter(
        (lines) =>
            lines.itemName === stageScLines[i].item &&
            stageScLines[i].qty !== 0,
        )
        if (bulkItems.length > 0) {
        tobeUpdated.push({
            id: bulkItems[0].id,
            item: bulkItems[0].itemName,
            serial: stageScLines[i].serial,
            qty: stageScLines[i].qty,
        })
        }
    }

    return tobeUpdated
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce
    }
});
