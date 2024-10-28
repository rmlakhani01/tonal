/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/cache'], function (search, record, cache) {
  const getInputData = () => {
    const results = []
    search
      .create({
        type: 'customrecord_accessory_staging',
        filters: [
          {
            name: 'custrecord_stg_status',
            operator: search.Operator.ANYOF,
            values: ['7', '8'],
          },
          {
            name: 'isinactive',
            operator: search.Operator.IS,
            values: false,
          },
        ],
        columns: [
          { name: 'internalid' },
          { name: 'custrecord_stg_status' },
          { name: 'custrecord_stg_header' },
          { name: 'custrecord_stg_lines' },
          { name: 'custrecord_stg_tracking_num' },
          { name: 'custrecord_stg_sales_order' },
          { name: 'custrecord_stg_order_id' },
        ],
      })
      .run()
      .each((result) => {
        results.push({
          id: result.getValue({ name: 'internalid' }),
          status: result.getValue({ name: 'custrecord_stg_status' }),
          headers: result.getValue({ name: 'custrecord_stg_header' }),
          lines: result.getValue({
            name: 'custrecord_stg_lines',
          }),
          trackingNum: result.getValue({
            name: 'custrecord_stg_tracking_num',
          }),
          salesOrder: result.getValue({
            name: 'custrecord_stg_sales_order',
          }),
          orderId: result.getValue({
            name: 'custrecord_stg_order_id',
          }),
        })
        return true
      })

    // log.debug('Results', results)
    return results
  }

  const map = (context) => {
    const data = JSON.parse(context.value)
    context.write({ key: data.orderId, value: data })
  }

  const reduce = (context) => {
    try {
      const SMART_KIT_ACCESSORIES = '51'
      const orders = []
      const tempOrder = {}
      let result
      const results = []
      const key = context.key
      context.values.forEach((row) => {
        orders.push(JSON.parse(row))
      })

      orders.forEach((order) => {
        if (order.status === '7') {
          tempOrder.salesOrderLines = getSalesOrderLines(order.salesOrder)
          tempOrder.smartKitSoLines = tempOrder.salesOrderLines?.filter(
            (lines) => lines.itemId === SMART_KIT_ACCESSORIES,
          )

          log.debug('tempOrder.salesOrderlInes', tempOrder.salesOrderLines)
          log.debug('tempOrder.smartKitSoLines', tempOrder.smartKitSoLines)
          if (
            tempOrder.smartKitSoLines &&
            tempOrder.smartKitSoLines?.length > 0
          ) {
            tempOrder.kitComponents = getComponents(tempOrder.smartKitSoLines)
            log.debug('tempOrder', tempOrder)
            result = processSmartKitAccy(tempOrder, orders)
          }
        }
      })

      for (const order in orders) {
        let temp = orders[order]
        if (temp.status === '8') {
          tempOrder.salesOrderLines = getSalesOrderLines(temp.salesOrder)
          tempOrder.salesOrderLines = removeDefaultItems(
            tempOrder.salesOrderLines,
          )
          const kitResults = getReloKitItems()
          const groupedKitItems = groupKitItems(kitResults)
          let tempItemId = tempOrder.salesOrderLines[0].itemId
          let tempKit = groupedKitItems.filter(
            (item) => item.itemId === tempItemId,
          )
          let [{ objects }] = tempKit
          if (objects && objects.length > 0) {
            if (objects[0].numOfComponents === context.values.length) {
              log.debug(
                'Have all components of the relocation kit been shipped?',
                true,
              )
              result = processReloKitAccy(objects, temp)
            }
          }
        }
        // break is required to ensure only one inventory transfer gets generated.
        break
      }

      if (typeof result === 'boolean') {
        return
      }

      if (typeof result === 'object') {
        orders.forEach((order) => {
          if (result.isSuccess === true) {
            results.push({
              id: order.id,
              errors: [],
              isSuccess: true,
              tranId: result.tranId,
            })
          }

          if (result.isSuccess === false) {
            results.push({
              id: order.id,
              errors: result.errors,
              isSuccess: false,
              tranId: null,
            })
          }
        })
      }

      context.write({ key: key, value: results })
    } catch (e) {
      log.debug('ERROR - REDUCE', e.stack)
    }
  }

  const processSmartKitAccy = (tempOrder, orders) => {
    // tempOrder.kitComponents = getComponents(tempOrder.salesOrderLines?.flat())
    log.debug('orders', orders)

    if (tempOrder.kitComponents.length === orders.length) {
      log.debug('Have all the kit items been shipped?', true)
      let shipDate, locale

      const sortedShipConfirm = orders.sort(
        (a, b) => parseFloat(b.id) - parseFloat(a.id),
      )
      const [latestShipConfirm] = sortedShipConfirm
      const headerData = JSON.parse(latestShipConfirm.headers)
      locale = getLocation(headerData.Distribution_Center)
      shipDate =
        parseDate(headerData.SHIP_DATE) || parseDate(headerData.Ship_Date)

      latestShipConfirm.shipConfirmLines = getSalesOrderLines(
        latestShipConfirm.salesOrder,
      )
      log.debug('Order to process', latestShipConfirm)
      return createItemFulfillment(
        latestShipConfirm.salesOrder,
        latestShipConfirm,
        shipDate,
        locale,
      )
    }

    if (tempOrder.kitComponents.length !== orders.length) {
      log.debug('Have all the kit items been shipped?', false)
      return false
    }
  }

  const processReloKitAccy = (objects, orders) => {
    let response = {}
    response.errors = []
    try {
      let components = objects
      let lines = []
      let headers = JSON.parse(orders.headers)
      response.id = orders.id

      lines.push(JSON.parse(orders.lines))
      lines = lines.flat()

      const shipDate = parseDate(headers['SHIP_DATE'] || headers['Ship_Date'])
      const fromLocation = getLocation(headers['Distribution_Center'])
      const toLocation = 462

      const inventoryTransfer = record.create({
        type: record.Type.INVENTORY_TRANSFER,
        isDynamic: true,
      })
      inventoryTransfer.setValue({
        fieldId: 'trandate',
        value: new Date(shipDate),
      })
      inventoryTransfer.setValue({ fieldId: 'subsidiary', value: 1 })
      inventoryTransfer.setValue({ fieldId: 'location', value: fromLocation })
      inventoryTransfer.setValue({
        fieldId: 'transferlocation',
        value: toLocation,
      }) // to be changed in prod
      inventoryTransfer.setValue({
        fieldId: 'custbody_customer_order_no',
        value: orders.orderId,
      })
      inventoryTransfer.setValue({
        fieldId: 'custbody_customer_so',
        value: orders.salesOrder,
      })

      let tempLine = lines[0]
      let qty =
        parseInt(tempLine['QUANTITY_SHIPPED']) || parseInt(tempLine['Box_Qty'])

      components.forEach((component) => {
        inventoryTransfer.selectNewLine({ sublistId: 'inventory' })
        inventoryTransfer.setCurrentSublistValue({
          sublistId: 'inventory',
          fieldId: 'item',
          value: component.componentId,
        })
        inventoryTransfer.setCurrentSublistValue({
          sublistId: 'inventory',
          fieldId: 'adjustqtyby',
          value: qty,
        })
        inventoryTransfer.commitLine({ sublistId: 'inventory' })
      })

      let tranId = inventoryTransfer.save()

      if (tranId) {
        response.isSuccess = true
        response.tranId = tranId
        response.soId = orders.salesOrderId
        return response
      }
    } catch (error) {
      log.debug('error - generating inventory transfer', error.stack)
      response.isSuccess = false
      response.errors.push(error)
      return response
    }
  }

  const orderData = (lineData) => {
    const orderDetails = []
    const orderLineData = []
    lineData.forEach((line) => {
      orderLineData.push({
        item: line.Ordered_Item || line.STYLE,
        qty: line.Box_Qty || line.QUANTITY_SHIPPED,
      })
    })

    orderLineData.forEach((orderLine) => {
      const tempItem = getItem(orderLine.item)
      orderDetails.push({
        item: orderLine.item,
        itemId: tempItem.id,
        itemType: tempItem.type,
        qty: orderLine.qty,
      })
    })

    return orderDetails
  }

  const getItem = (sku) => {
    let itemId = {}
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
        columns: [{ name: 'internalid' }, { name: 'type' }],
      })
      .run()
      .each((accessory) => {
        itemId.id = accessory.getValue({ name: 'internalid' })
        itemId.type = accessory.getValue({ name: 'type' })
        return true
      })
    return itemId
  }

  const getSalesOrderLines = (salesOrderId) => {
    try {
      if (salesOrderId) {
        const soLines = []
        const salesOrder = record.load({
          type: record.Type.SALES_ORDER,
          id: salesOrderId,
          isDynamic: true,
        })

        let lineCount = salesOrder.getLineCount({ sublistId: 'item' })
        for (var i = 0; i < lineCount; i += 1) {
          soLines.push({
            itemName: salesOrder.getSublistText({
              sublistId: 'item',
              fieldId: 'item',
              line: i,
            }),
            itemId: salesOrder.getSublistValue({
              sublistId: 'item',
              fieldId: 'item',
              line: i,
            }),
            itemType: salesOrder.getSublistValue({
              sublistId: 'item',
              fieldId: 'itemtype',
              line: i,
            }),
            itemQty: parseInt(
              salesOrder.getSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                line: i,
              }),
            ),
            qtyFilled: parseInt(
              salesOrder.getSublistValue({
                sublistId: 'item',
                fieldId: 'quantityfulfilled',
                line: i,
              }),
            ),
          })
        }

        return soLines
      }
    } catch (error) {
      log.debug('error - getSalesOrderLines', error)
    }
  }

  const getReloKitItems = () => {
    try {
      const results = []
      search
        .create({
          type: search.Type.ITEM,
          filters: [
            {
              name: 'name',
              operator: search.Operator.STARTSWITH,
              values: ['185'],
            },
          ],
          columns: [
            { name: 'internalid' },
            { name: 'itemid' },
            { name: 'memberitem' },
            { name: 'memberquantity' },
          ],
        })
        .run()
        .each((result) => {
          results.push({
            itemId: result.getValue({ name: 'internalId' }),
            itemName: result.getValue({ name: 'itemid' }),
            componentId: result.getValue({ name: 'memberitem' }),
            componentName: result.getText({ name: 'memberitem' }),
            componentQty: result.getValue({ name: 'memberquantity' }),
          })
          return true
        })

      return results
    } catch (e) {
      log.debug('ERROR', e)
    }
  }

  const removeDefaultItems = (uniqueItems) => {
    const defaultItems = ['1100', '49']
    const temp = uniqueItems.filter(
      (item) =>
        !(
          defaultItems.includes(item.itemId) &&
          defaultItems.includes(item.itemId)
        ),
    )
    if (temp.length === 0) return []
    if (temp.length > 0) return temp
  }

  const groupKitItems = (kits) => {
    const groupedData = kits.reduce((acc, cur) => {
      const itemId = cur.itemId
      if (!acc.has(itemId)) {
        acc.set(itemId, {
          itemId,
          objects: [cur],
          numOfComponents: 1,
        })
      } else {
        const item = acc.get(itemId)
        item.objects.push(cur)
        item.numOfComponents++
      }
      return acc
    }, new Map())

    const groupedArray = Array.from(
      groupedData.entries(),
      ([itemId, data]) => ({
        itemId,
        objects: data.objects.map((obj) => ({
          ...obj,
          numOfComponents: data.numOfComponents,
        })),
      }),
    )

    return groupedArray
  }

  const parseDate = (date) => {
    if (date.length === 8) {
      return `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`
    }

    if (date.length === 11 || date.length === 9) {
      return date
    }
  }

  const getLocation = (locale) => {
    if (locale) {
      const locations = [
        {
          name: 'GIL_EAST',
          id: 20,
        },
        {
          name: 'GIL_SW',
          id: 135,
        },
        {
          name: 'EXT_WEST',
          id: 17,
        },
      ]

      return locations.filter((location) => location.name === locale)[0].id
    }
  }

  const getComponents = (items) => {
    log.debug('getComponents - input', items)
    const components = []
    items.forEach((item) => {
      const kitItem = record.load({
        type: record.Type.KIT_ITEM,
        id: item.itemId,
        isDynamic: true,
      })

      const lineCount = kitItem.getLineCount({ sublistId: 'member' })
      for (let i = 0; i < lineCount; i++) {
        kitItem.selectLine({ sublistId: 'member', line: i })
        components.push({
          item: kitItem.getCurrentSublistValue({
            sublistId: 'member',
            fieldId: 'item',
          }),
          qty: kitItem.getCurrentSublistValue({
            sublistId: 'member',
            fieldId: 'quantity',
          }),
          numOfComponents: lineCount,
        })
      }
    })

    return components
  }

  const createItemFulfillment = (soId, order, shipDate, locale) => {
    let response = {}
    response.errors = []
    response.id = order.id
    try {
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

      fulfillmentRec.setValue({
        fieldId: 'externalid',
        value: `IF_${order.orderId}_${order.trackingNum}`,
      })

      fulfillmentRec.setValue({
        fieldId: 'memo',
        value: `${order.orderId}_${order.trackingNum}`,
      })

      var lineCount = fulfillmentRec.getLineCount({
        sublistId: 'item',
      })
      for (var i = 0; i < lineCount; i++) {
        fulfillmentRec.selectLine({ sublistId: 'item', line: i })
        fulfillmentRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'itemreceive',
          value: false,
        })
        fulfillmentRec.commitLine({ sublistId: 'item' })
      }

      // TAX ITEM LOGIC
      let taxLine = fulfillmentRec.findSublistLineWithValue({
        sublistId: 'item',
        fieldId: 'item',
        value: 1100,
      })

      // TAX ITEM FOUND
      if (taxLine !== -1) {
        fulfillmentRec.selectLine({
          sublistId: 'item',
          line: taxLine,
        })
        fulfillmentRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'itemreceive',
          value: true,
        })
        fulfillmentRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'location',
          value: locale,
        })
        fulfillmentRec.commitLine({ sublistId: 'item' })
      }

      order.shipConfirmLines.forEach((line) => {
        let tempLine = fulfillmentRec.findSublistLineWithValue({
          sublistId: 'item',
          fieldId: 'item',
          value: line.itemId,
        })

        // ITEM WAS FOUND
        if (tempLine !== -1) {
          fulfillmentRec.selectLine({
            sublistId: 'item',
            line: tempLine,
          })
          fulfillmentRec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'itemreceive',
            value: true,
          })
          fulfillmentRec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'location',
            value: locale,
          })
          fulfillmentRec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: parseInt(line.itemQty),
          })
          fulfillmentRec.commitLine({ sublistId: 'item' })
        }
      })

      let tranId = fulfillmentRec.save()
      if (tranId) {
        response.isSuccess = true
        response.tranId = tranId
        response.soId = order.salesOrderId
        return response
      }
    } catch (error) {
      log.debug('error - generating item fulfillment', error)
      response.isSuccess = false
      response.errors.push(error)
      return response
    }
  }

  const summarize = (summary) => {
    let success = [],
      failure = []

    summary.output.iterator().each((key, value) => {
      if (value !== 'undefined') {
        value = JSON.parse(value)
      }

      value.forEach((stage) => {
        if (stage.isSuccess === true) {
          success.push({ id: stage.id, data: stage })
        }

        if (stage.isSuccess === false) {
          failure.push({
            id: stage.id,
            data: stage,
            errors: stage.errors,
          })
        }
      })
      return true
    })

    if (success.length > 0) {
      success.forEach((stage) => {
        updateStagingRecord(stage, 5, null)
      })
    }

    if (failure.length > 0) {
      failure.forEach((stage) => {
        updateStagingRecord(stage, 6, stage.errors)
      })
    }
  }

  const updateStagingRecord = (stage, status, errors) => {
    const stageRecord = record.load({
      type: 'customrecord_accessory_staging',
      id: stage.id,
      isDynamic: true,
    })

    stageRecord.setValue({
      fieldId: 'custrecord_stg_status',
      value: status,
    })

    stageRecord.setValue({
      fieldId: 'custrecord_stg_date_process',
      value: new Date(),
    })

    if (errors) {
      stageRecord.setValue({
        fieldId: 'custrecord_stg_errors',
        value: JSON.stringify(errors),
      })
    }

    if (stage.data.soId) {
      stageRecord.setValue({
        fieldId: 'custrecord_stg_sales_order',
        value: stage.data.soId,
      })
    }

    if (stage.data.tranId) {
      stageRecord.setValue({
        fieldId: 'custrecord_stg_rel_trans',
        value: stage.data.tranId,
      })
    }

    stageRecord.save()
  }

  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize,
  }
})
