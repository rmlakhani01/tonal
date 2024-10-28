/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*
*Modification History
* Version     Instance          By              Date              Description
* V1          SB1               Vikash          14/03/2023        modification for error handling, To location stamping on bulk(grand parent)
* V2          SB1               Vikash          17/03/2023        modified for SHIP_METHOD and To Location stamp on BULK 
* V3          SB1               Vikash          21/03/2023        modified for InTransit Location = To Location when Carrier = "Flagship Will Call" or "Will Call".
* V4          SB1               Vikash          22/03/2023        modified for stopprocessing for other bo stgaing record if 'location not found' error occured
* V5          SB2               Vikash          26/03/2023        modified for the processing of "ELP" orders
* V6          SB2               Vikash          01/09/2023        modified for the B2B order needs to follow bulk process[ES-2899]
* V7          SB2               Vikash          06/11/2023        modification as per the jira ticket [ES-3087]
*/
 define(['N/search', 'N/record'], function (search, record) {
  const getInputData = () => {
    const bulkOrders = []
    search
      .create({
        type: 'customrecord_bulk_order_staging',
        filters: [
          {
            name: 'custrecord_stg_bo_status',
            operator: search.Operator.ANYOF,
            values: ['1'], // PENDING
          },
          {
            name: 'isinactive',
            operator: search.Operator.IS,
            values: false,
          },
          /* { 
            name: 'internalid',
            operator: search.Operator.IS,
            values: '31802'//'17520',
          }, */
        ],
        columns: [
          { name: 'internalid' },
          { name: 'name' },
          { name: 'custrecord_stg_bo_header' },
          { name: 'custrecord_stg_bo_lines' },
          { name: 'custrecord_stg_bo_file_name' },
        ],
      })
      .run()
      .each((bulkOrder) => {
        let bo = {
          id: bulkOrder.getValue({ name: 'internalid' }),
          name: bulkOrder.getValue({ name: 'name' }),
          header: JSON.parse(
            bulkOrder.getValue({
              name: 'custrecord_stg_bo_header',
            }),
          ),
          lines: JSON.parse(
            bulkOrder.getValue({
              name: 'custrecord_stg_bo_lines',
            }),
          ),
          file: bulkOrder.getValue({
            name: 'custrecord_stg_bo_file_name',
          }),
        }
        bulkOrders.push(bo)
        return true
      })

    return bulkOrders
  }

  // source all the data and group by order number.
  const map = (context) => {
    try {
      let headers, lines, filename, stgId
      let input = JSON.parse(context.value)
      if (
        input.header['Distribution_Center'].startsWith('GIL') === true
      ) {
        headers = normalizeGilbertHeaderData(input.header)
        lines = input.lines.sort(
          (a, b) => a['ORDER_LINE#'] > b['ORDER_LINE#'],
        )
      }

      //addedby vikash for handling the DC worng input
      else if (
        input.header['Distribution_Center'].startsWith('EXT') === true
      ) {
        headers = normalizeExtronHeaderData(input.header)
        lines = normalizeLineDataExtron(input.lines)
      }

      else{
        filename = input.file
        stgId = input.id
        context.write({
          key: headers['ORDER_NUMBER'],
          value: { headers, lines, filename, stgId ,error:{error:'WORNG_DC',message:input.header['Distribution_Center']}},
        })
      }

      filename = input.file
      stgId = input.id

      context.write({
        key: headers['ORDER_NUMBER'],
        value: { headers, lines, filename, stgId },
      })
    } catch (e) {
      log.debug('error', e.message)
      log.debug('stack', e.stack)
    }
  }

  const reduce = (context) => {
    try {
      log.debug('ReduceContext==',context);//added by vikash(03/14/2023)
      let output = []
      let orders = context.values
      let bulkOrders = orders//JSON.parse(orders)
      log.debug('bulkOrder.length==',bulkOrders.length);
      for(var p in bulkOrders){

        let bulkOrder = JSON.parse(bulkOrders[p]);
        // log.debug('bulkOrder=='+p,bulkOrder);

        log.debug('PROCESSING BO-STG',bulkOrder.stgId);

        //check for error details and update the bo staging with error
        let error = bulkOrder.error;
        if(error != undefined){
          log.debug('Updating BO-Staging With Error1..');
          record.submitFields({
            type: 'customrecord_bulk_order_staging',
            id: bulkOrder.stgId,
            values: {
              custrecord_stg_bo_status: 4,
              custrecord_stg_bo_process_date: new Date(),
              custrecord_stg_bo_error_message: JSON.stringify(bulkOrder.error),
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true,
            },
          })
          // return;
        }
        else{
          let bulkId = populateBulkRecord(
            bulkOrder.headers,
            bulkOrder.filename,
          )
    
          //check any error occured while creating bulk record
          var bulkError = bulkId.errors;
          log.debug('bulkError==',bulkError);
          if(bulkError.length > 0){
            log.debug('Updating BO-Staging With Error2..');
            record.submitFields({
              type: 'customrecord_bulk_order_staging',
              id: bulkOrder.stgId,
              values: {
                custrecord_stg_bo_status: 4,
                custrecord_stg_bo_process_date: new Date(),
                custrecord_stg_bo_error_message: JSON.stringify(bulkError[0]),
              },
              options: {
                enableSourcing: false,
                ignoreMandatoryFields: true,
              },
            })
            // return;
          }
          else{
            output.push(bulkId)
            log.debug('output-v',output);
            // return;
            //orders.forEach((order) => {
              let bulkSalesId, bulkSalesLines
              let order = bulkOrder//JSON.parse(order)
              bulkSalesId = populateBulkSalesOrder(
                order,
                order.headers,
                bulkId.bulkId,
              )
      
              //check for the error happening while creating BO SOs
              log.debug('bulkSalesId==',bulkSalesId)
              if(bulkSalesId.errors.length > 0){
                record.submitFields({
                  type: 'customrecord_bulk_order_staging',
                  id: order.stgId,
                  values: {
                    custrecord_stg_bo_status: 4,
                    // custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                    custrecord_stg_bo_process_date: new Date(),
                    custrecord_stg_bo_error_message: JSON.stringify(bulkSalesId.errors[0]),
                  },
                  options: {
                    enableSourcing: false,
                    ignoreMandatoryFields: true,
                  },
                })
                // return;
              }
              else{
                output.push(bulkSalesId)
      
                if (bulkSalesId.errors.length === 0) {
                  bulkSalesLines = populateBulkSalesOrderLines(
                    order,
                    order.headers,
                    order.lines,
                    bulkSalesId,
                  )
                }
  
                //check for the bulk so line creation error
                log.debug('bulkSOLinesError==',bulkSalesLines.errors);
                if(bulkSalesLines.errors.length > 0){
                  //partial casebased on itemnot found in NS
                  if(bulkSalesLines.errors[0].errorMessage == 'ITEM NOT FOUND'){
                    record.submitFields({
                      type: 'customrecord_bulk_order_staging',
                      id: order.stgId,
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
                    })
                  }
                  else{
                    record.submitFields({
                      type: 'customrecord_bulk_order_staging',
                      id: order.stgId,
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
                    })
                  }
                }
        
                output.push(bulkSalesLines)
                //success
                if (
                  bulkSalesId.errors.length === 0 &&
                  bulkSalesLines.errors.length === 0
                ) {
                  record.submitFields({
                    type: 'customrecord_bulk_order_staging',
                    id: order.stgId,
                    values: {
                      custrecord_stg_bo_status: 2,
                      custrecord_stg_bo_ns_bo_so: bulkSalesId.bulkSalesId,
                      custrecord_stg_bo_process_date: new Date(),
                      custrecord_stg_bo_ns_so:
                        order.headers['SALES_ORDER_DETAILS'][0]['id'],
                    },
                  })
                }
              }
              
              
            //})
            log.debug('output', output)
          }
        }

      }
     
    } catch (e) {
      log.debug('ERROR - REDUCE', e)
      log.debug('ERROR - REDUCE', e.stack)
    }
  }

  const summarize = (context) => {}

  // Source data from netsuite based on values provided from the staging record - Gilbert Only
  const normalizeGilbertHeaderData = (input) => {
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
  }

  // Source data from netsuite based on values provided from the staging record - Extron Only
  const normalizeExtronHeaderData = (input) => {
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
      log.debug('error - header, extron', e)
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
    log.debug('values - bulk', values)
    const errors = []
    try {
      let bulkRec = record.create({
        type: 'customrecord_bulk',
        isDynamic: true,
      })
      bulkRec.setValue({
        fieldId: 'name',
        value: values['ORDER_NUMBER'],
      })
      bulkRec.setValue({
        fieldId: 'externalid',
        value: values['ORDER_NUMBER'],
      })
      bulkRec.setValue({
        fieldId: 'altname',
        value: values['ORDER_NUMBER'],
      })
      bulkRec.setValue({
        fieldId: 'custrecord_bo_date',
        value: new Date(extractDate(values['ORDER_NUMBER'])),
      })
      bulkRec.setValue({
        fieldId: 'custrecord_bo_num',
        value: values['ORDER_NUMBER'],
      })

      if (values['FROM_LOCATION'].length === 0) {
        errors.push({
          bulkId: undefined,
          error: 'LOCATION DOES NOT EXIST',
        })
      }
      if(errors.length > 0){
        return { bulkId: undefined, errors: errors }
      }

      bulkRec.setValue({
        fieldId: 'custrecord_bo_from_location',
        value: values['FROM_LOCATION'][0]['id'],
      })

      let location =
        // values['SHIP_METHOD'][0]['name'] === 'CHR' ? 302 : 508//we can't hardcode these internalid here based on shipmethod we need set the intransit location by finding with externalid
        // values['SHIP_METHOD'][0]['name'] === 'CHR' ? 507 : 513//for sb2
        values['SHIP_METHOD'][0]['intransit_location']
      if(!location){
        errors.push({
          bulkId: undefined,
          error: 'In-Transit Location Missing for Carrier '+values['SHIP_METHOD'][0]['name'],
        })
      }
      if(errors.length > 0){
        return { bulkId: undefined, errors: errors }
      }

      bulkRec.setValue({
        fieldId: 'custrecord_bo_in_transit_location',
        value: location,
      })

      if (values['LOCATION_ID'].length === 0) {
        errors.push({
          bulkId: undefined,
          error: 'LOCATION NOT FOUND',
        })
      }
      if(errors.length > 0){
        return { bulkId: undefined, errors: errors }
      }
      /* bulkRec.setValue({
        fieldId: 'custrecord_bo_to_location',
        value: values['LOCATION_ID'][0]['id'],
      }) */
      //added by vikash(14/03/2023)

      //check for the special case : when Carrier = "Flagship Will Call" or "Will Call" then in-tarnsit and to-location will be same
      if(values['SHIP_METHOD'][0]['name'] == 'Flagship Will Call' || values['SHIP_METHOD'][0]['name'] == 'Will Call'){
        bulkRec.setValue({
          fieldId: 'custrecord_bo_to_location',
          value: location,
        })
      }
      else{
        if(values['LOCATION_ID'][0]['bulk_location']){
          bulkRec.setValue({
            fieldId: 'custrecord_bo_to_location',
            value: values['LOCATION_ID'][0]['bulk_location'],
          })
        }
        else{
          errors.push({ bulkId: undefined, error: 'Bulk To Location Missing' })
        }
        if(errors.length > 0){
          return { bulkId: undefined, errors: errors }
        }
      }
     
      bulkRec.setValue({
        fieldId: 'custrecord_bo_sent_to_dc_date',
        value: new Date(extractDate(values['ORDER_NUMBER'])),
      })

      if (values['SHIP_METHOD'].length === 0) {
        errors.push({ bulkId: undefined, error: 'CARRIER NOT FOUND' })
      }
      if(errors.length > 0){
        return { bulkId: undefined, errors: errors }
      }
      bulkRec.setValue({
        fieldId: 'custrecord_bo_carrier',
        value: values['SHIP_METHOD'][0]['id'],
      })

      if (filename)
        bulkRec.setValue({
          fieldId: 'custrecord_bo_bulk_order_file_name',
          value: filename,
        })

      let bulkId
      let bulkOrders = checkBulkOrder(values['ORDER_NUMBER'])
      if (bulkOrders && bulkOrders.length === 0) {
        bulkId = bulkRec.save({
          enableSource: true,
          ignoreMandatoryFields: true,
        })
      } else if (bulkOrders && bulkOrders.length === 1) {
        bulkId = bulkOrders[0].id
      } else {
        errors.push({
          bulkRecords: bulkOrders,
          stageRecordId: values.stgId,
          errorMessage:
            'TOO MANY BULK RECORDS FOUND WITH THE SAME EXTERNAL ID',
        })
      }
      log.debug('bulkId', bulkId)
      return { bulkId: bulkId, errors: errors }
    } catch (e) {
      errors.push({ fn: populateBulkRecord, error: e.message })
      log.debug('error - BulkOrder', e.message)
      log.debug('error - BulkOrder', e.stack)
      return { bulkId: undefined, errors: errors }
    }
  }

  const populateBulkSalesOrder = (order, values, bulkId) => {
    let errors = [];
    try {
      // let errors = []
      let bulkSalesRec = record.create({
        type: 'customrecord_bulk_sales_order',
        isDynamic: true,
      })

      bulkSalesRec.setValue({
        fieldId: 'name',
        value: `${values['ORDER_NUMBER']}_${values['PICK_NUMBER']}`,
      })

      bulkSalesRec.setValue({
        fieldId: 'externalid',
        value: `${values['ORDER_NUMBER']}_${values['PICK_NUMBER']}`,
      })

      values['SALES_ORDER_DETAILS'].length === 0
        ? errors.push({
            stageRecordId: order.stgId,
            errorMessage: 'SALES ORDER NOT FOUND',
          })
        : bulkSalesRec.setValue({
            fieldId: 'custrecord_bo_so_sales_order',
            value: values['SALES_ORDER_DETAILS'][0]['id'],
          })

      bulkSalesRec.setValue({
        fieldId: 'custrecord_bo_so_customer_order_no',
        value: values['PICK_NUMBER'],
      })
      bulkSalesRec.setValue({
        fieldId: 'custrecord_bo_so_parent',
        value: bulkId,
      })
      bulkSalesRec.setValue({
        fieldId: 'custrecord_bo_so_status',
        value: 1,
      })

      let bulkSalesRecId = null
      if (errors.length === 0) {
        bulkSalesRecId = bulkSalesRec.save()
      }

      return {
        bulkSalesId: bulkSalesRecId,
        orderNumber: values['PICK_NUMBER'],
        errors: errors,
      }
    } catch (e) {
      log.debug('error-populateBulkSalesOrder', e.message)
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

  const populateBulkSalesOrderLines = (
    order,
    headers,
    lines,
    bulkSalesId,
  ) => {
    try {
      let errors = []
      let bulkLines = []
      let itemNotFound = []
      lines.forEach((line) => {
        if (
          line['STYLE'] === '160-0001' ||
          line['STYLE'] === '150-0001'
        )
          return
        let item = getItemDetails(line['STYLE'])
        if (item.length > 0) {
          let bulkSalesOrderLines = record.create({
            type: 'customrecord_bulk_order_so_lines',
            isDynamic: true,
          })

          bulkSalesOrderLines.setValue({
            fieldId: 'name',
            value:
              headers['ORDER_NUMBER'] +
              '_' +
              headers['PICK_NUMBER'] +
              '_' +
              line['STYLE'],
          })

          bulkSalesOrderLines.setValue({
            fieldId: 'externalid',
            value:
              headers['ORDER_NUMBER'] +
              '_' +
              headers['PICK_NUMBER'] +
              '_' +
              line['STYLE'],
          })

          bulkSalesOrderLines.setValue({
            fieldId: 'custrecord_bo_so_line_num',
            value: line['ORDER_LINE#'],
          })
          bulkSalesOrderLines.setValue({
            fieldId: 'custrecord_bo_so_line_item',
            value: item[0]['id'],
          })
          bulkSalesOrderLines.setValue({
            fieldId: 'custrecord_bo_so_line_parent',
            value: bulkSalesId.bulkSalesId,
          })
          bulkSalesOrderLines.setValue({
            fieldId: 'custrecord_bo_so_line_released_qty',
            value: line['QUANTITY_ORDERED'],
          })

          if (headers['SALES_ORDER_DETAILS'].length === 1) {
            bulkSalesOrderLines.setValue({
              fieldId: 'custrecord_bo_so_line_so_parent',
              value: headers['SALES_ORDER_DETAILS'][0]['id'],
            })

            let bulkSalesOrderLinesId = bulkSalesOrderLines.save()
            if (bulkSalesOrderLinesId)
              bulkLines.push(bulkSalesOrderLinesId)
          } else {
            errors.push({
              stageRecordId: order.stgId,
              errorMessage:
                'SALES ORDER DOES NOT EXIST OR CANNOT BE FOUND.',
            })
          }
        }
        else{
          itemNotFound.push({item:line['STYLE'],errorMessage:'ITEM NOT FOUND',stageRecordId: order.stgId})
        }
      })
      if(itemNotFound.length > 0){
        return { errors: itemNotFound, bulkLinesIds: bulkLines }
      }
      else{
        return { errors: errors, bulkLinesIds: bulkLines }
      }
    } catch (e) {
      log.debug('error-populateBulkSalesOrderLines', e.message)
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
    summarize: summarize,
  }
})