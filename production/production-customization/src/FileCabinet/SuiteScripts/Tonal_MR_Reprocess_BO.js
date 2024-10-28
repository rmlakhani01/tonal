/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Reprocess BO
 * File Name   : Tonal_MR_Reprocess_BO.js
 * Description : This script is used for BO reporcess from the selected suitelet sublist data
 * Created On  : 20/03/2023
 * Modification Details:
 * Version     Instance          By              Date              Description
 * V1          SB1               Vikash          31/03/2023        modification for error handling cases
 * V2          SB2               Vikash          26/05/2023        modified for the processing of "ELP" orders
 * V3          SB2               Vikash          01/09/2023        modified for the B2B order needs to follow bulk process[ES-2899]
 * V4          SB2               Vikash          06/11/2023        modification as per the jira ticket [ES-3087]
 ************************************************************/
define(["N/runtime","N/search","N/record"], function(runtime, search,record) {

    function getInputData() {
        try {
            var scriptObj = runtime.getCurrentScript();
            var data = scriptObj.getParameter('custscript_bo_reprocess_data');
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
            var boStgRecId = data.bo_stg_rec_id;
            var boStgRecName = data.bo_stg_rec_name;
            var boStgStatus = data.bo_stg_status;
            var boStgError = data.bo_stg_error;
            var boStgPd = data.bo_stg_pd;
            var boStgFilename = data.bo_stg_file_name;
            var voStagingCd = data.bo_stg_cd; 
            log.debug('processing bo-stg||'+boStgRecId,'boStgRecName=='+boStgRecName);
            var boStgExternalId = boStgRecName;
            var x = boStgRecName.split('_');
            var bulkSoExternalid = x[0]+'_'+x[1];
            var bulkExternalId = x[0];

            log.debug('boStgRecExternalId=='+boStgExternalId,'bulkExternalid=='+bulkExternalId+'||bulkSoExternalid=='+bulkSoExternalid);
            
            //get the header, line details form bo_stg
            var boObj = search.lookupFields({
                type: 'customrecord_bulk_order_staging',
                id: boStgRecId,
                columns: ['custrecord_stg_bo_header','custrecord_stg_bo_lines','custrecord_stg_bo_file_name']
            });

            var bulkCreated = getBulkDetails(bulkExternalId);
            log.debug('bulkCreated==',bulkCreated);

            //get the data as required for the process in both of the case 
            var headers, lines, filename, stgId;
            if(JSON.parse(boObj.custrecord_stg_bo_header)['Distribution_Center'].startsWith('GIL') === true){
                headers = normalizeGilbertHeaderData(JSON.parse(boObj.custrecord_stg_bo_header))
                lines = JSON.parse(boObj.custrecord_stg_bo_lines).sort((a, b) => a['ORDER_LINE#'] > b['ORDER_LINE#'])
            }

            else if(JSON.parse(boObj.custrecord_stg_bo_header)['Distribution_Center'].startsWith('EXT') === true){
                headers = normalizeExtronHeaderData(JSON.parse(boObj.custrecord_stg_bo_header))
                lines = normalizeLineDataExtron(JSON.parse(boObj.custrecord_stg_bo_lines))
            }

            log.debug('headers==',headers);
            log.debug('lines==',lines);
            
            //Case 1: Bulk Created
            if(bulkCreated){ 

                log.debug('CASE1 RUNNING...');

                //check bulkso created or not
                var bulkSoCreated = getBulkSoDetails(bulkSoExternalid);
                log.debug('bulkSoCreated==',JSON.stringify(bulkSoCreated));
                //case 1.1: bulkso created
                if(typeof(bulkSoCreated) == 'object' && bulkSoCreated != false){

                    log.debug('CASE1.1 RUNNING...');

                    //get the so lines details from bo_stg and compare with the bulkso lines, if matched sku continue else add new line for the not matched sku
                    //note sku 160-0001 and 150-0001 are not included in bulksolines if they are avilable on bo_stg or added later on in bo_stg
                    var bulksoObj = record.load({
                        type: 'customrecord_bulk_sales_order',
                        id: bulkSoCreated.bulk_so_id,
                        isDynamic: true
                    });

                    var bosoLines = bulksoObj.getLineCount('recmachcustrecord_bo_so_line_parent');
                    log.debug('bosoLines==',bosoLines);
                    var itemDetailsRequired = [],itemDetailsOnBulkSo = [];
                    for(var bosol = 0 ; bosol < bosoLines ; bosol++){
                        var bosoItemid = bulksoObj.getSublistValue('recmachcustrecord_bo_so_line_parent','custrecord_bo_so_line_item',bosol);
                        // log.debug('bosoItemid==',bosoItemid);
                        var bosoItemSku = search.lookupFields({
                            type: 'item',
                            id: bosoItemid,
                            columns: ['name']
                        }).name;
                        // log.debug('bosoItemSku==',bosoItemSku);
                        itemDetailsOnBulkSo.push({item_sku:bosoItemSku,id:bosoItemid});
                    }

                    //get items whihc needs to add on bosoline by comapring two arrayof items one is for bosolines and one is fro bostg items
                    itemDetailsRequired = lines.filter((elem) => !itemDetailsOnBulkSo.find(({ item_sku }) => elem['STYLE'] === item_sku) && (elem['STYLE'] != '160-0001' ||elem['STYLE'] != '150-0001'));
                    log.debug('itemDetailsRequired=='+itemDetailsRequired.length,itemDetailsRequired);//return;
                    var notaVailableItemDetails = [];
                    for(var d in itemDetailsRequired){

                        //skip for the skus - 160-0001,150-0001
                        // log.debug("itemDetailsRequired[d]['STYLE']==",itemDetailsRequired[d]['STYLE']);
                        if(itemDetailsRequired[d]['STYLE'] !== '160-0001' && itemDetailsRequired[d]['STYLE'] !== '150-0001'){
                            //get the item details by sku ifnot found makepartial flag true and stmap status as partial
                            var item = getItemDetails(itemDetailsRequired[d]['STYLE']);
                            if(item.length > 0){
                                var boSOLineObj = record.create({
                                    type: 'customrecord_bulk_order_so_lines',
                                    isDynamic: true
                                });
        
                                //externalid
                                boSOLineObj.setValue('externalid',bulkSoExternalid+'_'+itemDetailsRequired[d]['STYLE']);
        
                                //name
                                boSOLineObj.setValue('name',bulkSoExternalid+'_'+itemDetailsRequired[d]['STYLE']);
        
                                //item
                                boSOLineObj.setValue('custrecord_bo_so_line_item',item[0].id);
        
                                //order line
                                boSOLineObj.setValue('custrecord_bo_so_line_num',itemDetailsRequired[d]['ORDER_LINE#']);
        
                                //released qty
                                boSOLineObj.setValue('custrecord_bo_so_line_released_qty',itemDetailsRequired[d]['QUANTITY_ORDERED']);
        
                                //bulkso parent
                                boSOLineObj.setValue('custrecord_bo_so_line_parent',bulkSoCreated.bulk_so_id);
        
                                //ns so
                                boSOLineObj.setValue('custrecord_bo_so_line_so_parent',bulkSoCreated.ns_so_number);
        
                                var bosoLineId = boSOLineObj.save();
        
                                if(bosoLineId){
                                    log.debug('Line Added On BO SO',bosoLineId+'||'+bulkSoExternalid+'_'+itemDetailsRequired[d]['STYLE']);
                                }
                            }
                            else{
                                notaVailableItemDetails.push(itemDetailsRequired[d]);
                            }
                        }

                    }

                    log.debug('notaVailableItemDetails=='+notaVailableItemDetails.length,notaVailableItemDetails);

                    var bulkSoId = bulksoObj.save();
                    if(bulkSoId){
                        //partial case
                        if(notaVailableItemDetails.length > 0){
                            var notAvItem = [],objError = {};
                            for(var c in notaVailableItemDetails){
                                notAvItem.push({
                                    item:notaVailableItemDetails[c]['STYLE']
                                });
                            }
                            objError.item = notAvItem;
                            objError.errorMessage = 'ITEM NOT FOUND';
                            objError.stageRecordId = boStgRecId;
                            record.submitFields({
                                type: 'customrecord_bulk_order_staging',
                                id: boStgRecId,
                                values: {
                                    custrecord_stg_bo_status: 3,
                                    custrecord_stg_bo_ns_bo_so: bulkSoCreated.bulk_so_id,
                                    custrecord_stg_bo_process_date: new Date(),
                                    custrecord_stg_bo_ns_so:headers['SALES_ORDER_DETAILS'][0]['id'],
                                    custrecord_stg_bo_error_message:JSON.stringify([objError])
                                },
                            });
                            log.debug('BULK STAGING PROCESSED PARTIALLY!!',boStgRecId);
                        }
                        //success case
                        else{
                            record.submitFields({
                                type: 'customrecord_bulk_order_staging',
                                id: boStgRecId,
                                values: {
                                    custrecord_stg_bo_status: 2,
                                    custrecord_stg_bo_ns_bo_so: bulkSoCreated.bulk_so_id,
                                    custrecord_stg_bo_process_date: new Date(),
                                    custrecord_stg_bo_ns_so:headers['SALES_ORDER_DETAILS'][0]['id'],
                                    custrecord_stg_bo_error_message:''
                                },
                            });
                            log.debug('BULK STAGING PROCESSED SUCCESSFULLY!!',boStgRecId);
                        }
                    }
                }
                //case 1.2: bulkso not creted
                else if(bulkSoCreated == false){

                    log.debug('CASE1.2 RUNNING...');

                    var bulkId = bulkCreated;

                    var output = [];

                    var bulkSalesId, bulkSalesLines;
    
                    bulkSalesId = populateBulkSalesOrder({stgId:boStgRecId},headers,bulkId);
    
                    log.debug('bulkSalesId==',bulkSalesId);

                    //check for error in bulk sales order
                    if(bulkSalesId.errors.length > 0){
                        record.submitFields({
                            type: 'customrecord_bulk_order_staging',
                            id: boStgRecId,
                            values: {
                                custrecord_stg_bo_status: 4,
                                custrecord_stg_bo_process_date: new Date(),
                                custrecord_stg_bo_error_message: JSON.stringify(bulkSalesId.errors[0]),
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true,
                            },
                        });
                        log.debug('BULK STAGING PROCESSED UNSUCCESSFULLY-1-!!',boStgRecId);
                    }
                    
                    else{
                        output.push(bulkSalesId);

                        if (bulkSalesId.errors.length === 0) {
                            bulkSalesLines = populateBulkSalesOrderLines({stgId:boStgRecId},headers,lines,bulkSalesId)
                        }
                        log.debug('bulkSOLines==',bulkSalesLines);
                        output.push(bulkSalesLines);
        
                        log.debug('bulkSOLinesError==',bulkSalesLines.errors);
                        //check for error in bulk ssle order lines
                        if(bulkSalesLines.errors.length > 0){
                            //partial casebased on itemnot found in NS
                            if(bulkSalesLines.errors[0].errorMessage == 'ITEM NOT FOUND'){
                                record.submitFields({
                                    type: 'customrecord_bulk_order_staging',
                                    id: boStgRecId,
                                    values: {
                                        custrecord_stg_bo_status: 3,
                                        custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                                        custrecord_stg_bo_ns_so:order.headers['SALES_ORDER_DETAILS'][0]['id'],
                                        custrecord_stg_bo_process_date: new Date(),
                                        custrecord_stg_bo_error_message: JSON.stringify(bulkSalesLines.errors),
                                    },
                                    options: {
                                        enableSourcing: false,
                                        ignoreMandatoryFields: true,
                                    },
                                });
                            }
                            else{
                                record.submitFields({
                                    type: 'customrecord_bulk_order_staging',
                                    id: boStgRecId,
                                    values: {
                                        custrecord_stg_bo_status: 4,
                                        custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                                        custrecord_stg_bo_process_date: new Date(),
                                        custrecord_stg_bo_error_message: JSON.stringify(bulkSalesLines.errors[0]),
                                    },
                                    options: {
                                        enableSourcing: false,
                                        ignoreMandatoryFields: true,
                                    },
                                });
                            }
                            log.debug('BULK STAGING PROCESSED UNSUCCESSFULLY-2-!!',boStgRecId);
                        }
        
                        log.debug('output',output);
    
                        //success
                        if (bulkSalesId.errors.length === 0 && bulkSalesLines.errors.length === 0) {
                            record.submitFields({
                                type: 'customrecord_bulk_order_staging',
                                id: boStgRecId,
                                values: {
                                    custrecord_stg_bo_status: 2,
                                    custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                                    custrecord_stg_bo_process_date: new Date(),
                                    custrecord_stg_bo_ns_so:headers['SALES_ORDER_DETAILS'][0]['id'],
                                    custrecord_stg_bo_error_message:''
                                },
                            });
                            log.debug('BULK STAGING PROCESSED SUCCESSFULLY!!',boStgRecId);
                        }
                    }
                }
            }

            //Case 2: Bulk Not Created
            else if(bulkCreated == false){

                log.debug('CASE2 RUNNING...');

                var output = [];
                var bulkId = populateBulkRecord(headers,boObj.custrecord_stg_bo_file_name);

                //check for error in bulk
                if(bulkId.errors.length > 0){
                    record.submitFields({
                        type: 'customrecord_bulk_order_staging',
                        id: boStgRecId,
                        values: {
                            custrecord_stg_bo_status: 4,
                            custrecord_stg_bo_process_date: new Date(),
                            custrecord_stg_bo_error_message: JSON.stringify(bulkId.errors[0]),
                        },
                        options: {
                            enableSourcing: false,
                            ignoreMandatoryFields: true,
                        },
                    });
                    log.debug('BULK STAGING PROCESSED UNSUCCESSFULLY-1-!!',boStgRecId);
                }
                else{

                    output.push(bulkId);

                    var bulkSalesId, bulkSalesLines;
        
                    bulkSalesId = populateBulkSalesOrder({stgId:boStgRecId},headers,bulkId.bulkId);

                    log.debug('bulkSalesId==',bulkSalesId);

                    //check for error in bulk sales order
                    if(bulkSalesId.errors.length > 0){
                        record.submitFields({
                            type: 'customrecord_bulk_order_staging',
                            id: boStgRecId,
                            values: {
                                custrecord_stg_bo_status: 4,
                                custrecord_stg_bo_process_date: new Date(),
                                custrecord_stg_bo_error_message: JSON.stringify(bulkSalesId.errors[0]),
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true,
                            },
                        });
                        log.debug('BULK STAGING PROCESSED UNSUCCESSFULLY-2-!!',boStgRecId);
                    }
                    else{
                    
                        output.push(bulkSalesId);
                
                        if (bulkSalesId.errors.length === 0) {
                            bulkSalesLines = populateBulkSalesOrderLines({stgId:boStgRecId},headers,lines,bulkSalesId)
                        }
                        log.debug('bulkSOLines==',bulkSalesLines);
                        output.push(bulkSalesLines);

                        log.debug('bulkSOLinesError==',bulkSalesLines.errors);
                        //check for error in bulk ssle order lines
                        if(bulkSalesLines.errors.length > 0){
                            //partial casebased on itemnot found in NS
                            if(bulkSalesLines.errors[0].errorMessage == 'ITEM NOT FOUND'){
                                record.submitFields({
                                    type: 'customrecord_bulk_order_staging',
                                    id: boStgRecId,
                                    values: {
                                        custrecord_stg_bo_status: 3,
                                        custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                                        custrecord_stg_bo_ns_so:order.headers['SALES_ORDER_DETAILS'][0]['id'],
                                        custrecord_stg_bo_process_date: new Date(),
                                        custrecord_stg_bo_error_message: JSON.stringify(bulkSalesLines.errors),
                                    },
                                    options: {
                                        enableSourcing: false,
                                        ignoreMandatoryFields: true,
                                    },
                                });
                            }
                            else{
                                record.submitFields({
                                    type: 'customrecord_bulk_order_staging',
                                    id: boStgRecId,
                                    values: {
                                        custrecord_stg_bo_status: 4,
                                        custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                                        custrecord_stg_bo_process_date: new Date(),
                                        custrecord_stg_bo_error_message: JSON.stringify(bulkSalesLines.errors[0]),
                                    },
                                    options: {
                                        enableSourcing: false,
                                        ignoreMandatoryFields: true,
                                    },
                                });
                            }
                            log.debug('BULK STAGING PROCESSED UNSUCCESSFULLY-3-!!',boStgRecId);
                        }
    
                        log.debug('output',output);
    
                        //success
                        if (bulkSalesId.errors.length === 0 && bulkSalesLines.errors.length === 0) {
                            record.submitFields({
                                type: 'customrecord_bulk_order_staging',
                                id: boStgRecId,
                                values: {
                                    custrecord_stg_bo_status: 2,
                                    custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                                    custrecord_stg_bo_process_date: new Date(),
                                    custrecord_stg_bo_ns_so:headers['SALES_ORDER_DETAILS'][0]['id'],
                                    custrecord_stg_bo_error_message:''
                                },
                            });
                            log.debug('BULK STAGING PROCESSED SUCCESSFULLY!!',boStgRecId);
                        }
                    }

                }
                
            }
            
        } catch (error) {
            log.error('Error : In Map Stage',error);
        }
    }

    function reduce(context) {
        try {
           
        } catch (error) {
            log.error('Error : In Reduce Stage',error);
        }
    }

    function summarize(summary) {
        try {
            
        } catch (error) {
            log.error('Error : In Summarize Stage',error);
        }
    }

    //function to get the bulk details 
    function getBulkDetails(bulkExternaliId){
        try {
            var customrecord_bulkSearchObj = search.create({
                type: "customrecord_bulk",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["externalid","anyof",bulkExternaliId]
                ],
                columns:
                [
                   search.createColumn({
                      name: "name",
                      sort: search.Sort.ASC,
                      label: "Name"
                   })
                ]
            });
            var searchResultCount = customrecord_bulkSearchObj.runPaged().count;
            log.debug("Bulk Count",searchResultCount);
            var bulkId = false;
            customrecord_bulkSearchObj.run().each(function(result){
                bulkId = result.id;
                return true;
            });
            return bulkId;
        } catch (error) {
            log.error('Error : In Get Bulk Details',error);
            return false;
        }
    }

    //function to get the bulkso details
    function getBulkSoDetails(bulkSoExternalid){
        try {
            var customrecord_bulk_sales_orderSearchObj = search.create({
                type: "customrecord_bulk_sales_order",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["externalid","anyof",bulkSoExternalid]
                ],
                columns:
                [
                   search.createColumn({
                      name: "name",
                      sort: search.Sort.ASC,
                      label: "Name"
                   }),
                   search.createColumn({name: "custrecord_bo_so_sales_order", label: "Sales Order"}),
                   search.createColumn({name: "custrecord_bo_so_customer_order_no", label: "Customer Order No"})
                ]
            });
            var searchResultCount = customrecord_bulk_sales_orderSearchObj.runPaged().count;
            log.debug("Bulk SO Count",searchResultCount);
            var bulkSOId = false;
            customrecord_bulk_sales_orderSearchObj.run().each(function(result){
                bulkSOId = {bulk_so_id:result.id,bulk_so_name:result.getValue('name'),ns_so_number:result.getValue('custrecord_bo_so_sales_order')}
                return true;
            });
            return bulkSOId;
        } catch (error) {
            log.error('Error : In Get BulkSO Details',error);
            return false;
        }
    }

    // Source data from netsuite based on values provided from the staging record - Gilbert Only
    function normalizeGilbertHeaderData(input){
        try {
            let header = {}
            for (const [key, value] of Object.entries(input)) {
                header[key] = value
                if (key.match('DATE')) header[key] = parseDateString(value)

                if (key.match('ORDER_NUMBER'))
                    header['LOCATION_ID'] = retrieveLocation(
                    extractLocation(value),
                )

                if (key.match('PICK_NUMBER')) {
                    let tempValue;
                    if(value.startsWith('ELP') || value.startsWith('SO')){
                      tempValue = value;
                    }
                    else{
                      tempValue = value.replace(/\D/g, '')
                    }
                    // let tempValue = value.replace(/\D/g, '')
                    header['SALES_ORDER_DETAILS'] = getSalesOrder(tempValue)
                }

                if (key.match(/SHIP_METHOD\/VIA/))
                    header['SHIP_METHOD'] = getCarrier(value)

                if (key.match('Distribution_Center'))
                    header['FROM_LOCATION'] = retrieveLocation(value)
            }
            return header
        } catch (error) {
            log.error('error - header, gilbert', e);
        }
    }

    // Source data from netsuite based on values provided from the staging record - Extron Only
    function normalizeExtronHeaderData(input){
        try {
            let header = {}
            for (const [key, value] of Object.entries(input)) {
                header[key] = value

                if (key.match('Delivery_ID')) {
                    let tempValue;
                    if(value.startsWith('ELP') || value.startsWith('SO')){
                      tempValue = value;
                    }
                    else{
                      tempValue = value.replace(/\D/g, '')
                    }
                    // let tempValue = value.replace(/\D/g, '')
                    header['SALES_ORDER_DETAILS'] = getSalesOrder(tempValue)
                    header['PICK_NUMBER'] = tempValue
                }

                if (key.match('Ship_Method_Code'))
                header['SHIP_METHOD'] = getCarrier(value)

                if (key.match('Order_Number')) {
                    header['ORDER_NUMBER'] = value
                    header['LOCATION_ID'] = retrieveLocation(
                        extractLocation(value),
                    )
                }

                if (key.match('Distribution_Center')) {
                    header['FROM_LOCATION'] = retrieveLocation(value)
                }
            }
            return header
        } catch (e) {
            log.error('error - header, extron', e);
        }
    }

    const normalizeLineDataExtron = (input) => {
        try {
          const output = []
          input.forEach((lineData) => {
            let lines = {}
            for (const [key, value] of Object.entries(lineData)) {
              lines[key] = value
    
              if (key.match('Ordered_Item')) lines['STYLE'] = value
    
              if (key.match('Line_Number')) lines['ORDER_LINE#'] = value
    
              if (key.match('Ordered_Quantity'))
                lines['QUANTITY_ORDERED'] = value
            }
            output.push(lines)
          })
    
          return output
        } catch (e) {
          log.debug('error - extron, line', e)
        }
    }

    const extractDate = (input) => {
        var d
        var temp = input.split('-')
        if (temp[0].length === 6) {
            var tempValue = temp[0]
            d =
            tempValue.slice(0, 2) +
            '/' +
            tempValue.slice(2, 4) +
            '/20' +
            tempValue.slice(4, 6)
        }

        if (temp[0].length === 8) {
            var tempValue = temp[0]
            d =
            tempValue.slice(0, 2) +
            '/' +
            tempValue.slice(2, 4) +
            '/' +
            tempValue.slice(4, 8)
        }

        return d
    }
    
    const parseDateString = (input) => {
    return `${input.slice(4, 6)}/${input.slice(6, 8)}/${input.slice(
        0,
        4,
    )}`
    }
    
    const retrieveLocation = (shipCode) => {
    const locations = []
    search
        .create({
        type: search.Type.LOCATION,
        filters: [
            {
            name: 'externalid',
            operator: search.Operator.ANYOF,
            values: [shipCode],
            },
        ],
        columns: [{ name: 'internalid' }, { name: 'name' },{name:'custrecord_bulk_location'}],
        })
        .run()
        .each((location) => {
        let local = {
            id: location.getValue({ name: 'internalid' }),
            name: location.getValue({ name: 'name' }),
            code: shipCode,
            bulk_location:location.getValue({name:'custrecord_bulk_location'})//added by vikash(14/03/2023)
        }
        locations.push(local)
        return true
        })

    return locations
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
    
    const getCarrier = (carrier) => {
    const carriers = []
    search
        .create({
        type: 'customrecord_carrier',
        filters: [
            {
            name: 'name',
            operator: search.Operator.IS,
            values: [carrier],
            },
        ],
        columns: [{ name: 'name' }, { name: 'internalid' },{ name: 'custrecord_tnl_intransit_location' }],
        })
        .run()
        .each((carrier) => {
        let method = {
            name: carrier.getValue({ name: 'name' }),
            id: carrier.getValue({ name: 'internalid' }),
            intransit_location: carrier.getValue({ name: 'custrecord_tnl_intransit_location' })
        }
        carriers.push(method)
        return true
        })

    return carriers
    }
    
    const getSalesOrder = (pickNumber) => {
    const salesOrders = []
    search
        .create({
        type: search.Type.TRANSACTION,
        filters: [
            {
            name: 'type',
            operator: search.Operator.ANYOF,
            values: ['SalesOrd'],
            },
            {
            name: 'mainline',
            operator: search.Operator.IS,
            values: true,
            },
            {
            name: 'otherrefnum',
            operator: search.Operator.EQUALTO,
            values: [pickNumber],
            },
        ],
        columns: [{ name: 'internalid' }, { name: 'entity' }],
        })
        .run()
        .each((salesOrder) => {
        let order = {
            id: salesOrder.getValue({ name: 'internalid' }),
            customer: salesOrder.getValue({ name: 'entity' }),
        }

        salesOrders.push(order)
        return true
        })

    return salesOrders
    }
    
    const populateBulkRecord = (values, filename) => {
        log.debug('values - bulk', values);
        const errors = [];
        try {
            let bulkRec = record.create({
                type: 'customrecord_bulk',
                isDynamic: true,
            });

            bulkRec.setValue({
                fieldId: 'name',
                value: values['ORDER_NUMBER'],
            });

            bulkRec.setValue({
                fieldId: 'externalid',
                value: values['ORDER_NUMBER'],
            });

            bulkRec.setValue({
                fieldId: 'altname',
                value: values['ORDER_NUMBER'],
            });

            bulkRec.setValue({
                fieldId: 'custrecord_bo_date',
                value: new Date(extractDate(values['ORDER_NUMBER'])),
            });
            bulkRec.setValue({
                fieldId: 'custrecord_bo_num',
                value: values['ORDER_NUMBER'],
            });

            if (values['FROM_LOCATION'].length === 0) {
                errors.push({
                    bulkId: undefined,
                    error: 'LOCATION DOES NOT EXIST',
                });
            }
            if(errors.length > 0){
                return { bulkId: undefined, errors: errors };
            }

            bulkRec.setValue({
                fieldId: 'custrecord_bo_from_location',
                value: values['FROM_LOCATION'][0]['id'],
            });

            let location = values['SHIP_METHOD'][0]['intransit_location'];
            if(!location){
                errors.push({
                    bulkId: undefined,
                    error: 'In-Transit Location Missing for Carrier '+values['SHIP_METHOD'][0]['name'],
                });
            }
            if(errors.length > 0){
                return { bulkId: undefined, errors: errors };
            }

            bulkRec.setValue({
                fieldId: 'custrecord_bo_in_transit_location',
                value: location,
            });

            if (values['LOCATION_ID'].length === 0) {
                errors.push({
                    bulkId: undefined,
                    error: 'LOCATION NOT FOUND',
                });
            }
            if(errors.length > 0){
                return { bulkId: undefined, errors: errors };
            }

            //check for the special case : when Carrier = "Flagship Will Call" or "Will Call" then in-tarnsit and to-location will be same
            if(values['SHIP_METHOD'][0]['name'] == 'Flagship Will Call' || values['SHIP_METHOD'][0]['name'] == 'Will Call'){
                bulkRec.setValue({
                    fieldId: 'custrecord_bo_to_location',
                    value: location,
                });
            }
            else{
                bulkRec.setValue({
                    fieldId: 'custrecord_bo_to_location',
                    value: values['LOCATION_ID'][0]['bulk_location'],
                });
            }

            bulkRec.setValue({
                fieldId: 'custrecord_bo_sent_to_dc_date',
                value: new Date(extractDate(values['ORDER_NUMBER'])),
            });

            if (values['SHIP_METHOD'].length === 0) {
                errors.push({ bulkId: undefined, error: 'CARRIER NOT FOUND' });
            }
            if(errors.length > 0){
                return { bulkId: undefined, errors: errors };
            }
            bulkRec.setValue({
                fieldId: 'custrecord_bo_carrier',
                value: values['SHIP_METHOD'][0]['id'],
            });

            if (filename)
            bulkRec.setValue({
                fieldId: 'custrecord_bo_bulk_order_file_name',
                value: filename,
            });

            let bulkId;
            let bulkOrders = checkBulkOrder(values['ORDER_NUMBER']);
            if (bulkOrders && bulkOrders.length === 0) {
                bulkId = bulkRec.save({
                    enableSource: true,
                    ignoreMandatoryFields: true,
                });
            } else if (bulkOrders && bulkOrders.length === 1) {
                bulkId = bulkOrders[0].id;
            } else {
                errors.push({
                    bulkRecords: bulkOrders,
                    stageRecordId: values.stgId,
                    errorMessage:
                    'TOO MANY BULK RECORDS FOUND WITH THE SAME EXTERNAL ID',
                });
            }
            log.debug('bulkId', bulkId);
            return { bulkId: bulkId, errors: errors };
        } catch (e) {
            errors.push({ fn: populateBulkRecord, error: e.message });
            log.debug('error - BulkOrder', e.message);
            log.debug('error - BulkOrder', e.stack);
            return { bulkId: undefined, errors: errors };
        }
    }
    
    const populateBulkSalesOrder = (order, values, bulkId) => {
        let errors = [];
        try {
            // let errors = []
            let bulkSalesRec = record.create({
                type: 'customrecord_bulk_sales_order',
                isDynamic: true,
            });

            bulkSalesRec.setValue({
                fieldId: 'name',
                value: `${values['ORDER_NUMBER']}_${values['PICK_NUMBER']}`,
            });

            bulkSalesRec.setValue({
                fieldId: 'externalid',
                value: `${values['ORDER_NUMBER']}_${values['PICK_NUMBER']}`,
            });

            values['SALES_ORDER_DETAILS'].length === 0
            ? errors.push({
                stageRecordId: order.stgId,
                errorMessage: 'SALES ORDER NOT FOUND',
            })
            : bulkSalesRec.setValue({
                fieldId: 'custrecord_bo_so_sales_order',
                value: values['SALES_ORDER_DETAILS'][0]['id'],
            });

            bulkSalesRec.setValue({
                fieldId: 'custrecord_bo_so_customer_order_no',
                value: values['PICK_NUMBER'],
            });
            
            bulkSalesRec.setValue({
                fieldId: 'custrecord_bo_so_parent',
                value: bulkId,
            });

            bulkSalesRec.setValue({
                fieldId: 'custrecord_bo_so_status',
                value: 1,
            });

            let bulkSalesRecId = null
            if (errors.length === 0) {
                bulkSalesRecId = bulkSalesRec.save();
            }

            return {
                bulkSalesId: bulkSalesRecId,
                orderNumber: values['PICK_NUMBER'],
                errors: errors,
            }
        } catch (e) {
            log.debug('error-populateBulkSalesOrder', e.message);
                errors.push({
                stageRecordId: order.stgId,
                errorMessage: e.message,
            })
            return {
                bulkId:bulkId,
                bulkSalesId: undefined,
                orderNumber: values['PICK_NUMBER'],
                errors: errors,
            }
        }
    }
    
    const populateBulkSalesOrderLines = (order,headers,lines,bulkSalesId) => {
        try {
            let errors = [];
            let bulkLines = [];
            let itemNotFound = [];
            lines.forEach((line) => {
                if (line['STYLE'] === '160-0001' || line['STYLE'] === '150-0001') return;
                let item = getItemDetails(line['STYLE']);
                if (item.length > 0) {
                    let bulkSalesOrderLines = record.create({
                        type: 'customrecord_bulk_order_so_lines',
                        isDynamic: true,
                    });

                    bulkSalesOrderLines.setValue({
                        fieldId: 'name',
                        value:
                        headers['ORDER_NUMBER'] +
                        '_' +
                        headers['PICK_NUMBER'] +
                        '_' +
                        line['STYLE'],
                    });

                    bulkSalesOrderLines.setValue({
                        fieldId: 'externalid',
                        value:
                        headers['ORDER_NUMBER'] +
                        '_' +
                        headers['PICK_NUMBER'] +
                        '_' +
                        line['STYLE'],
                    });

                    bulkSalesOrderLines.setValue({
                        fieldId: 'custrecord_bo_so_line_num',
                        value: line['ORDER_LINE#'],
                    });

                    bulkSalesOrderLines.setValue({
                        fieldId: 'custrecord_bo_so_line_item',
                        value: item[0]['id'],
                    });

                    bulkSalesOrderLines.setValue({
                        fieldId: 'custrecord_bo_so_line_parent',
                        value: bulkSalesId.bulkSalesId,
                    });

                    bulkSalesOrderLines.setValue({
                        fieldId: 'custrecord_bo_so_line_released_qty',
                        value: line['QUANTITY_ORDERED'],
                    });

                    if (headers['SALES_ORDER_DETAILS'].length === 1) {
                        bulkSalesOrderLines.setValue({
                            fieldId: 'custrecord_bo_so_line_so_parent',
                            value: headers['SALES_ORDER_DETAILS'][0]['id'],
                        });

                        let bulkSalesOrderLinesId = bulkSalesOrderLines.save()
                        if (bulkSalesOrderLinesId) bulkLines.push(bulkSalesOrderLinesId);
                    } else {
                        errors.push({
                            stageRecordId: order.stgId,
                            errorMessage:
                            'SALES ORDER DOES NOT EXIST OR CANNOT BE FOUND.',
                        });
                    }
                }
                else{
                    itemNotFound.push({item:line['STYLE'],errorMessage:'ITEM NOT FOUND',stageRecordId: order.stgId});
                }
            });
            if(itemNotFound.length > 0){
                return { errors: itemNotFound, bulkLinesIds: bulkLines };
            }
            else{
                return { errors: errors, bulkLinesIds: bulkLines };
            }
        } catch (e) {
            log.debug('error-populateBulkSalesOrderLines', e.message);
        }
    }
    
    const checkBulkOrder = (externalid) => {
        try {
            const bulkOrders = []
            search
            .create({
                type: 'customrecord_bulk',
                filters: [
                {
                    name: 'externalidstring',
                    operator: search.Operator.IS,
                    values: [externalid],
                },
                ],
                columns: [{ name: 'internalid' }],
            })
            .run()
            .each((bulkOrder) => {
                bulkOrders.push({
                id: bulkOrder.getValue({ name: 'internalid' }),
                })
                return true
            })

            return bulkOrders
        } catch (e) {
            log.debug('ERROR - CHECK BULK ORDER', e)
        }
    }

    const extractLocation = (ORDER_NUMBER) => {
        if(ORDER_NUMBER.includes('RMA')){
            const BULK_PREFIX_POS = 7
            let sections = ORDER_NUMBER.split('-')
            return (
              sections[1].slice(BULK_PREFIX_POS, BULK_PREFIX_POS + 3) +
              '_' +
              sections[1].slice(BULK_PREFIX_POS + 3, sections[1].length - 1)
            )
        }
        const BULK_PREFIX_POS = 4
        let sections = ORDER_NUMBER.split('-')
        return (
            sections[1].slice(BULK_PREFIX_POS, BULK_PREFIX_POS + 3) +
            '_' +
            sections[1].slice(BULK_PREFIX_POS + 3, sections[1].length - 1)
        )
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
