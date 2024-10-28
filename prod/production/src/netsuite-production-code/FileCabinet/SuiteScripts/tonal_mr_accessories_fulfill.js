/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define(['N/record', 'N/search', 'N/file'], function (
  record,
  search,
  file,
) {
  const getInputData = () => {
    const results = []
    search
      .create({
        type: 'customrecord_tnl_bulk_imports',
        filters: [
          {
            name: 'isinactive',
            operator: search.Operator.IS,
            values: false,
          },
          {
            name: 'custrecord_tnl_bfi_import_status',
            operator: search.Operator.IS,
            values: ['1'],
          },
          {
            name: 'custrecord_tnl_bfi_import_type',
            operator: search.Operator.IS,
            values: ['101'],
          },
        ],
        columns: [
          { name: 'id' },
          { name: 'custrecord_tnl_bfi_import_status' },
          { name: 'custrecord_tnl_bfi_import_file' },
          { name: 'custrecord_tnl_bfi_error_file' },
          { name: 'owner' },
          { name: 'created', sort: search.Sort.DESC },
        ],
      })
      .run()
      .each((result) => {
        results.push({
          id: result.getValue({ name: 'id' }),
          status: result.getValue({
            name: 'custrecord_tnl_bfi_import_status',
          }),
          file: result.getValue({
            name: 'custrecord_tnl_bfi_import_file',
          }),
          errors: result.getValue({
            name: 'custrecord_tnl_bfi_error_file',
          }),
          owner: result.getValue({ name: 'owner' }),
          created: result.getValue({
            name: 'created',
            sort: search.Sort.DESC,
          }),
        })
        return true
      })
    log.debug('number of staged record to process', results.length)

    return results
  }

  const map = (context) => {
    const rec = JSON.parse(context.value)
    const importFile = file.load({ id: rec.file }).getContents()
    let data = csvToJSON(importFile)
    log.debug('data', data)

    for (var i = 0; i < data.length; i++) {
      data[i]['id'] = rec.id
      context.write({ key: data[i]['WC Order ID'], value: data[i] })
    }
  }

  const reduce = (context) => {
    const orderId = context.key
    let data = JSON.parse(context.values[0])
    let updatedData = dataExtraction(data)

    try {
      let location, lines, soId, shipDate, line, qty, item
      for (const [key, value] of Object.entries(updatedData)) {
        if (key === 'orderId') soId = value
        if (key === 'location') location = value
        if (key === 'lines') lines = value
        if (key === 'Ship Out Date') shipDate = value
      }

      lines.push({
        product_skus_tax: 1100,
        product_skus_tax_quantity: 1,
      })

      log.debug('Sales Order ID', soId)

      let fulfillmentRec = record.transform({
        fromType: record.Type.SALES_ORDER,
        fromId: soId,
        toType: record.Type.ITEM_FULFILLMENT,
        isDynamic: true,
      })

      fulfillmentRec.setValue({
        fieldId: 'trandate',
        value: new Date(shipDate),
      })
      log.debug('Lines: ', JSON.stringify(lines))
      log.debug('Location: ', JSON.stringify(location))

      for (var i = 0; i < lines.length; i += 1) {
        for (var key in lines[i]) {
          if (
            key === 'Product SKUs' ||
            key === 'Product SKUs 2' ||
            key === 'Product SKUs 3' ||
            key === 'Product SKUs 4' ||
            key === 'Product SKUs 5' ||
            key === 'Product SKUs 6' ||
            key === 'product_skus_tax'
          ) {
            item = lines[i][key]
          }

          if (
            key === 'Product SKUs Quantity' ||
            key === 'Product SKUs Quantity 2' ||
            key === 'Product SKUs Quantity 3' ||
            key === 'Product SKUs Quantity 4' ||
            key === 'Product SKUs Quantity 5' ||
            key === 'Product SKUs Quantity 6' ||
            key === 'product_skus_tax_quantity'
          ) {
            qty = lines[i][key]
          }
        }
        line = fulfillmentRec.findSublistLineWithValue({
          sublistId: 'item',
          fieldId: 'item',
          value: item,
        })
        if (line !== -1 && qty) {
          fulfillmentRec.selectLine({
            sublistId: 'item',
            line: line,
          })

          fulfillmentRec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'itemreceive',
            value: true,
          })

          fulfillmentRec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: qty,
          })
          fulfillmentRec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'location',
            value: location,
          })
        }
        fulfillmentRec.commitLine({ sublistId: 'item' })
      }
      let fulfillId = fulfillmentRec.save()
      if (fulfillId) {
        context.write({
          key: data.id,
          value: { success: true, id: orderId },
        })
        log.debug(
          'Item Fulfillment generated with the ID of : ' + fulfillId,
        )
      }
    } catch (error) {
      context.write({
        key: data.id,
        value: { error: error.message, success: false, id: orderId },
      })
    }
  }

  const summarize = (summary) => {
    let stageId,
      failedCount = [],
      successCount = []

    summary.output.iterator().each((key, value) => {
      value = JSON.parse(value)
      if (value.success === true) {
        successCount.push({ id: key, orderId: value.id })
      }

      if (value.success === false) {
        failedCount.push({
          id: key,
          orderId: value.id,
          error: 'Please check import file and sales order.',
        })
      }
      stageId = key

      return true
    })

    try {
      if (stageId) {
        var inputRecord = record.load({
          type: 'customrecord_tnl_bulk_imports',
          id: stageId,
        })
        inputRecord.setValue({
          fieldId: 'custrecord_tnl_bfi_fulfillment_count',
          value: successCount.length,
        })
        inputRecord.setValue({
          fieldId: 'custrecord_tnl_bfi_fulfill_err_count',
          value: failedCount.length,
        })
        if (failedCount.length === 0) {
          inputRecord.setValue({
            fieldId: 'custrecord_tnl_bfi_import_status',
            value: 3,
          })
        }
        if (failedCount.length > 0) {
          inputRecord.setValue({
            fieldId: 'custrecord_tnl_bfi_import_status',
            value: 101,
          })

          inputRecord.setValue({
            fieldId: 'custrecord_error_output',
            value: JSON.stringify(failedCount),
          })
        }

        inputRecord.save()
      }
    } catch (error) {
      log.debug('errors updating staging record', error)
    }
  }

  const csvToJSON = (csv) => {
    try {
      csv = csv.replace(/['"]+/g, '')
      var lines = csv.split('\n')
      var delimiter = ','
      var results = []
      var headers = lines[0].split(delimiter)

      for (var i = 1; lines && i < lines.length; i++) {
        const currentLine = lines[i].split(delimiter)
        const obj = {}

        if (currentLine.length === 1) break
        if (currentLine.length > 1) {
          for (let j = 0; j < headers.length; j++) {
            if (currentLine[j].includes('/') === true) {
              if (currentLine[j].match(/([^/]*\/){3}/)) {
                currentLine[j] = currentLine[j]
                  .split('/')[0]
                  .replace(/[\r"]/g, '')
              }
            }

            if (currentLine[j].includes('|') === true) {
              currentLine[j] = currentLine[j]
                .split('|')[1]
                .replace(/[\r"]/g, '')
                .trim()
            }

            obj[headers[j].trim()] = currentLine[j]
              .trim()
              .replace(/"/g, '')
          }

          results.push(obj)
        }
      }

      return results
    } catch (error) {
      log.debug('error', error)
    }
  }

  const getSalesOrder = (id) => {
    try {
      const salesOrders = []
      search
        .create({
          type: search.Type.TRANSACTION,
          filters: [
            {
              name: 'otherrefnum',
              operator: search.Operator.EQUALTO,
              values: [id],
            },
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
              name: 'status',
              operator: search.Operator.ANYOF,
              values: ['SalesOrd:B', 'SalesOrd:E', 'SalesOrd:D'],
            },
          ],
          columns: [{ name: 'internalid' }],
        })
        .run()
        .each((salesOrder) => {
          salesOrders.push({
            id: salesOrder.getValue({ name: 'internalid' }),
          })
          return true
        })
      return salesOrders
    } catch (error) {
      log.debug('error fetching sales order', error)
    }
  }

  const getItem = (sku) => {
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
          {
            name: 'type',
            operator: search.Operator.ANYOF,
            values: ['InvtPart', 'Assembly'],
          },
        ],
        columns: [{ name: 'internalid' }],
      })
      .run()
      .each((accessory) => {
        let item = {
          id: accessory.getValue({ name: 'internalid' }),
        }
        items.push(item)
        return true
      })
    return items
  }

  const dataExtraction = (data) => {
    try {
      let updatedData = {}
      let lines = []

      // sets of keys for individual objects
      let keys = [
        ['Product SKUs', 'Product SKUs Quantity'],
        ['Product SKUs 2', 'Product SKUs Quantity 2'],
        ['Product SKUs 3', 'Product SKUs Quantity 3'],
        ['Product SKUs 4', 'Product SKUs Quantity 4'],
        ['Product SKUs 5', 'Product SKUs Quantity 5'],
        ['Product SKUs 6', 'Product SKUs Quantity 6'],
      ]

      for (var i = 0; i < keys.length; i++) {
        let result = keys[i].reduce(
          (acc, curr) => (
            curr in data && (acc[curr] = data[curr]), acc
          ),
          {},
        )
        lines.push(result)
      }

      // emptying the objects with no values
      lines.forEach((e) =>
        Object.entries(e).forEach(
          ([key, value]) => value.length || delete e[key],
        ),
      )

      // returning only the objects that have values
      let filtered = lines.filter((e) => Object.keys(e).length)

      // iterating through the objects and geting there ns ids for the values
      for (var i = 0; i < filtered.length; i++) {
        for (const [key, value] of Object.entries(filtered[i])) {
          if (
            key === 'Product SKUs' ||
            key === 'Product SKUs 2' ||
            key === 'Product SKUs 3' ||
            key === 'Product SKUs 4' ||
            key === 'Product SKUs 5' ||
            key === 'Product SKUs 6'
          )
            filtered[i][key] = getItem(value)[0].id
        }
      }

      updatedData['lines'] = filtered

      for (const [key, value] of Object.entries(data)) {
        if (key.match(/^Pick Up Origin$/) && value !== '') {
          let temp = getLocation(value)
          log.debug('location', temp)
          if (temp) updatedData['location'] = temp[0].id
        }
        if (key.match(/^WC Order ID$/) && value !== '') {
          log.debug('sales order input', value)
          let temp = getSalesOrder(value)
          log.debug('sales order id', temp)
          if (temp) updatedData['orderId'] = temp[0].id
        }
        if (key.match(/^Ship Out Date$/)) {
          log.debug('ship out date', value)
          updatedData[key] = value
        }
      }

      return updatedData
    } catch (e) {
      log.debug('error in data extraction', e.message)
      log.debug('error in data extraction', e.stack)
    }
  }

  const getLocation = (locale) => {
    if (locale) {
      const locations = [
        {
          name: 'Gilbert',
          id: 20,
        },
        {
          name: 'SouthGilbert',
          id: 135,
        },
        {
          name: 'Extron',
          id: 17,
        },
      ]

      return locations.filter((location) => location.name === locale)
    } else {
      log.debug(
        'LOCALE NOT PROVIDED',
        'ERROR: ' + locale + ' does not exist',
      )
    }
  }

  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize,
  }
})
