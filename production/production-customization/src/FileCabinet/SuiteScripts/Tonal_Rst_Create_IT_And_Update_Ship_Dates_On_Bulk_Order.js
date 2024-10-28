/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal_Rst_Create_IT_And_Update_Ship_Dates_On_Bulk_Order.js
 * File Name   : Tonal_Rst_Create_IT_And_Update_Ship_Dates_On_Bulk_Order.js
 * Description : This script is used for creation of IT and update dates on Bulk SO Lines with IT details
 * Created On  : 11/01/2023
 * Modification Details:
 * Version	 	Env 	Date			By					Reason
 * 	V1			SB		03/10/2023		Vikash				Added logic for "A" suffix to order id process
 *  V2          SB1     04/03/2023      Vikash              updated for GMT/UTC date to PST/PDT for IT creation and BO SO Lines stamping dates
 *  V2          SB1     05/03/2023      Vikash              updated for without sequence process logic
 *  V3          SB1     06/03/2023      Vikash              updated for daylight saving and standard time for GMT/UTC to PST/PDT
 *  V4          SB1     18/04/2023      Vikash              updated logic for PROD issue of sequencing dates not came from
 *                                                          far-eye for the process of delivery,receiptand installation
 *  V5          SB2     25/04/2023      Vikash              modification for handling "B"and "C" suffix orders
 *  V6          SB2     08/09/2023      Vikash              modification for the create IF when insatllation date came and update dates on the BO SO Lines
 *  V7          SB2     20/09/2023      Vikash              modification for the swapping of items on SO based on Kit trainer item sku
 *  V8          SB2     22/09/2023      Vikash              modification for the swapping for items on SO based on kit componets tariner sku
 *  V9          SB2     22/09/2023      Vikash              modification for the ryder order reallocation process
 *  V10         SB2     28/09/2023      Vikash              modifcation with the latest discussion with Ali
 *  V11         SB2     03/10/2023      Vikash              modification for the stamping of IF details on BO SO Lines
 *  V12         SB2     10/10/2023      Vikash              modification for the adding T1 kit internal id(1410) and removed sku code, sku qty log
 *  V13         SB2     29/11/2023      Vikash              modification for the Ryder order status update on BO SO Lines
 *  v14         SB2     28/12/2023      Vikash              modifctaion for ryder order fulfilment location will be from BULK "To Location" field
 *  V15         SB2     02/02/2024      Vikash              modifictaion for the sales order hvaing location at header , with back order qty needs to fulfill correctly
 *  V16         SB2     06/06/2024      Vikash              modifictaion for the "150-0016" component check on Far Eye payload
 *  V17         SB2     07/06/2024      Vikash              modifictaion for the "150-0016" component check on Far Eye payload
 *  V18         SB2     07/26/2024      Vikash              modifictaion for the conversion of GMT to EST date jira ticket[Es-3640]
 *  V19         SB2/Prd 09/25/2024      Vikash              modifictaion for the break keyword comment for the IF cretion, it was terminating the loop and not setting the item on IF
 ************************************************************/
define(["N/record", "N/search", "N/format", "N/runtime"], function (
  record,
  search,
  format,
  runtime
) {
  function createITAndStampSOShipLineDates(context) {
    try {
      //get the script parameter details for daylight saving and standard time conversion GMT/UTC to PST/PDT
      //if set then 8 hrs difference else 7 hrs difference
      var scriptObj = runtime.getCurrentScript();
      var standardTime = scriptObj.getParameter("custscript_daytime_saving");
      log.debug("standardTime==", standardTime);
      var responseObj = new Object();
      var payload = context;
      log.debug("payload==", payload);

      var orderId = payload.order_id;
      var actualDeliveryDate = payload.actual_delivery_date;
      var receivedLmhDate = payload.received_lmh_date;
      var installationDate = payload.installation_date;
      var serialNumber = payload.serial_number;
      var DCCode = payload.DC_Code;
      var LMHCode = payload.LMH_Code;
      /* var SKUCode = payload.SKU_Code;
            var SKUQty = payload.SKU_Qty; */
      log.debug(
        "serialNumber==+" + serialNumber,
        "||DCCode==" + DCCode + "||LMHCode==" + LMHCode
      );
      log.debug(
        "actualDeliveryDate==" + actualDeliveryDate,
        "receivedLmhDate||" +
          receivedLmhDate +
          "||installationDate||" +
          installationDate
      );
      if (!orderId) {
        responseObj.status = 0;
        responseObj.message = "fail";
        responseObj.details = [
          {
            message: "MISSING_ORDER_ID",
            details: { order_id: payload.order_id },
          },
        ];
        log.debug("responseObj==", responseObj);
        return responseObj;
      }

      if (!actualDeliveryDate && !receivedLmhDate && !installationDate) {
        responseObj.status = 0;
        responseObj.message = "fail";
        responseObj.details = [
          {
            message: "MISSING_DATES",
            details: {
              actual_delivery_date: payload.actual_delivery_date,
              received_lmh_date: payload.received_lmh_date,
              installation_date: payload.installation_date,
            },
          },
        ];
        log.debug("responseObj==", responseObj);
        return responseObj;
      }

      if (!DCCode || !LMHCode) {
        return returnResponse(0, "fail", "MISISNG_DC/LMH_CODE", "", orderId);
      }

      //case 1. If DC code and LMH Code is same meaning it's ryder order process
      if (DCCode == LMHCode) {
        log.debug("RYDER_ORDER_PROCESS", "RUNNING..");
        return ryderOrderProcess(payload, standardTime);
      }
      //case 2 . If DC code and LMH Code is not same meaning it's bulk order process
      else {
        log.debug("BULK_ORDER_PROCESS", "RUNNING");
        var ITCreated = "";

        //check order avilable in NS
        //first get the orderid with "A" suffix if found then processs,else check with without "A"
        //suffix and process
        //Check first for "C" then "B" the "A" suffix else without any suffix
        orderId = orderId + "C";
        log.debug("orderId==", orderId);
        var bulkSO = getBulkSalesOrder(orderId);
        log.debug("bulkSO1==", bulkSO);
        var error = bulkSO.error;
        //search with "B" suffix customer order
        if (error) {
          orderId = orderId.split("C")[0] + "B";
          bulkSO = getBulkSalesOrder(orderId);
          error = bulkSO.error;
          log.debug("bulkSO2==", bulkSO);
          if (error) {
            //search with "A" suffix customer order
            orderId = orderId.split("B")[0] + "A";
            bulkSO = getBulkSalesOrder(orderId);
            error = bulkSO.error;
            log.debug("bulkSO3==", bulkSO);
            if (error) {
              //search without any suffix
              orderId = orderId.split("A")[0];
              bulkSO = getBulkSalesOrder(orderId);
              log.debug("bulkSO4==", bulkSO);
              error = bulkSO.error;
            }
          }
        }
        error = bulkSO.error;
        //fail case
        if (error) {
          responseObj.status = 0;
          responseObj.message = "fail";
          responseObj.details = [
            { message: "SALES_ORDER_NOT_FOUND", details: bulkSO },
          ];
          log.debug("responseObj==", responseObj);
          return responseObj;
        }
        //success
        //get the bo so lines for compare to update the correct lines on bo so
        var lineItemDetails = getBulkSoLineDetails(bulkSO.rec_id);
        log.debug("lineItemDetails==", lineItemDetails);
        //fail
        var errorBL = lineItemDetails.error;
        if (errorBL) {
          responseObj.status = 0;
          responseObj.message = "fail";
          responseObj.details = [
            { message: "SALES_ORDER_LINES_NOT_FOUND", details: errorBL },
          ];
          log.debug("responseObj==", responseObj);
          return responseObj;
        }
        var dit = false,
          rit = false,
          iit = false;
        //check for bulk sales order lines if any one of the line havig it created don't do anything
        var D_processITCreated = getITCreatedForAnyProcess(
          "delivery",
          bulkSO.rec_id
        );
        var R_processITCreated = getITCreatedForAnyProcess(
          "receiving",
          bulkSO.rec_id
        );
        var I_processITCreated = getITCreatedForAnyProcess(
          "installation",
          bulkSO.rec_id
        );
        log.debug("D_processITCreated==", D_processITCreated);
        log.debug("R_processITCreated==", R_processITCreated);
        log.debug("I_processITCreated==", I_processITCreated);
        dit = D_processITCreated.d_it_created;
        rit = R_processITCreated.r_it_created;
        iit = I_processITCreated.i_it_created;
        //success
        lineItemDetails = lineItemDetails.item_details;
        //check for the dates and create respective IT from location and to location will decide on these dates
        //Case1: Delivery Operation
        if (payload.actual_delivery_date && dit == false) {
          log.debug("Case1", "Delivery Operation..");
          //check IT is created or not. If created then create only IT and stamp error.Else update the so lines and then create IT
          //get the bulk parent id
          var parentRecId = bulkSO.parent_rec_id;
          var externalId = "";
          if (parentRecId) {
            var parentRecObj = search.lookupFields({
              type: "customrecord_bulk",
              id: parentRecId,
              columns: [
                "custrecord_bo_num",
                "name",
                "custrecord_bo_in_transit_location",
                "custrecord_bo_to_location",
              ],
            });
            externalId = parentRecObj.custrecord_bo_num + "_" + orderId + "-D";
          }
          log.debug("Finding IT With ExternalId==", externalId);
          var itExists = getITExist(externalId);
          log.debug("itExists==", itExists);
          //Case: If IT not created then update the SO line with all validationsand create IT
          if (itExists == false) {
            //validate for the unexpected data
            var cd = actualDeliveryDate.toString().includes("-");
            log.debug("cdacd==", cd);
            if (cd == false) {
              //update BO SO lines with error details
              var updatedSO1 = updateErrorSoLinesRecord(
                bulkSO.rec_id,
                "delivery",
                "",
                "",
                lineItemDetails,
                payload.messageId,
                payload
              );

              responseObj.status = 0;
              responseObj.message = "fail";
              responseObj.details = [
                { message: "INVALID_PAYLOAD", error: payload },
              ];
              // responseObj.details = [{message:'MISSING_DELIVERY_DATE',details:{order_id:payload.order_id}}];
              log.debug("responseObj==", responseObj);
              return responseObj;
            }
            if (cd == true) {
              //check for valid date data or not(yyyy-mm-dd)
              var vd = new Date(actualDeliveryDate);
              log.debug("vdacd==", vd);
              if (vd == "Invalid Date" || !vd) {
                // log.debug('I am IN');return;
                //update BO SO lines with error details
                var updatedSO1 = updateErrorSoLinesRecord(
                  bulkSO.rec_id,
                  "delivery",
                  "",
                  "",
                  lineItemDetails,
                  payload.messageId,
                  payload
                );

                responseObj.status = 0;
                responseObj.message = "fail";
                responseObj.details = [
                  { message: "INVALID_PAYLOAD", error: payload },
                ];
                // responseObj.details = [{message:'MISSING_DELIVERY_DATE',details:{order_id:payload.order_id}}];
                log.debug("responseObj==", responseObj);
                return responseObj;
              }
              //sucess
              //first update so lines
              var updatedSO = updateSoLinesRecord(
                bulkSO.rec_id,
                "delivery",
                payload.actual_delivery_date,
                "",
                lineItemDetails,
                payload.messageId,
                standardTime
              );
              //craete delivery IT in NS
              ITCreated = createITInNetSuite(
                payload.actual_delivery_date,
                "delivery",
                orderId /* payload.order_id */,
                lineItemDetails,
                standardTime
              );
              log.debug("ITCreatedDelivery==", ITCreated);
              var errorIT = ITCreated.error;
              //fail
              if (errorIT) {
                //update bo so lines with error
                updateErrorSoLinesRecord(
                  bulkSO.rec_id,
                  "delivery",
                  "",
                  "",
                  lineItemDetails,
                  payload.messageId,
                  ITCreated
                );
                responseObj.status = 0;
                responseObj.message = "fail";
                responseObj.details = [
                  {
                    delivery_date: payload.actual_delivery_date,
                    message: "INVENTORY_TRANSFER_NOT_CREATED",
                    error: ITCreated,
                  },
                ];
                log.debug("responseObj==", responseObj);
                return responseObj;
              }
              //sucess
              //update all the lines with date,qty and IT
              var updatedSO = updateSoLinesRecord(
                ITCreated.bulk_so_id,
                "delivery",
                payload.actual_delivery_date,
                ITCreated.ns_inventory_transfer_id,
                ITCreated.item_details,
                payload.messageId,
                standardTime
              );

              responseObj.status = 1;
              responseObj.message = "success";
              responseObj.details = [
                {
                  ns_inventory_transfer_id: ITCreated.ns_inventory_transfer_id,
                  delivery_date: payload.actual_delivery_date,
                  message: "Delivery Date Updated In NetSuite",
                },
              ];
              log.debug("responseObjDelivery==", responseObj);
              return responseObj;
            }
          }
          //Case: If IT exists create IT and stamp error on SO Lines
          else {
            ITCreated = createITInNetSuite(
              payload.actual_delivery_date,
              "delivery",
              orderId /* payload.order_id */,
              lineItemDetails,
              standardTime
            );
            log.debug("ITCreatedDelivery==", ITCreated);
            var errorIT = ITCreated.error;
            //fail
            if (errorIT) {
              //update bo so lines with error
              updateErrorSoLinesRecord(
                bulkSO.rec_id,
                "delivery",
                "",
                "",
                lineItemDetails,
                "notupdate",
                ITCreated
              );
              responseObj.status = 0;
              responseObj.message = "fail";
              responseObj.details = [
                {
                  delivery_date: payload.actual_delivery_date,
                  message: "INVENTORY_TRANSFER_NOT_CREATED",
                  error: ITCreated,
                },
              ];
              log.debug("responseObj==", responseObj);
              return responseObj;
            }
          }
        }
        //Case2: Receiving Operation
        if (payload.received_lmh_date && rit == false) {
          log.debug("Case2", "Receiving Operation..");
          //check IT is created or not. If created then create only IT and stamp error.Else update the so lines and then create IT
          //get the bulk parent id
          var parentRecId = bulkSO.parent_rec_id;
          var externalId = "";
          if (parentRecId) {
            var parentRecObj = search.lookupFields({
              type: "customrecord_bulk",
              id: parentRecId,
              columns: [
                "custrecord_bo_num",
                "name",
                "custrecord_bo_in_transit_location",
                "custrecord_bo_to_location",
              ],
            });
            externalId = parentRecObj.custrecord_bo_num + "_" + orderId + "-R";
          }
          log.debug("Finding IT With ExternalId==", externalId);
          var itExists = getITExist(externalId);
          log.debug("itExists==", itExists);
          //Case: If IT not created then update the SO line with all validationsand create IT
          if (itExists == false) {
            //validate for the unexpected data
            var cd = receivedLmhDate.toString().includes("-");
            log.debug("cdrd==", cd);
            if (cd == false) {
              //update BO SO lines with error details
              var updatedSO1 = updateErrorSoLinesRecord(
                bulkSO.rec_id,
                "receiving",
                "",
                "",
                lineItemDetails,
                payload.messageId,
                payload
              );

              responseObj.status = 0;
              responseObj.message = "fail";
              responseObj.details = [
                { message: "INVALID_PAYLOAD", error: payload },
              ];
              log.debug("responseObj==", responseObj);
              return responseObj;
            }
            if (cd == true) {
              //check for valid date data or not(yyyy-mm-dd)
              var vd = new Date(receivedLmhDate);
              log.debug("vdrd==", vd);
              if (vd == "Invalid Date" || !vd) {
                //update BO SO lines with error details
                var updatedSO1 = updateErrorSoLinesRecord(
                  bulkSO.rec_id,
                  "receiving",
                  "",
                  "",
                  lineItemDetails,
                  payload.messageId,
                  payload
                );

                responseObj.status = 0;
                responseObj.message = "fail";
                responseObj.details = [
                  { message: "INVALID_PAYLOAD", error: payload },
                ];
                log.debug("responseObj==", responseObj);
                return responseObj;
              }
              //sucess
              //first update so lines
              var updatedSO = updateSoLinesRecord(
                bulkSO.rec_id,
                "receiving",
                payload.received_lmh_date,
                "",
                lineItemDetails,
                payload.messageId,
                standardTime
              );
              //craete receiving IT in NS
              ITCreated = createITInNetSuite(
                payload.received_lmh_date,
                "receiving",
                orderId /* payload.order_id */,
                lineItemDetails,
                standardTime
              );
              log.debug("ITCreatedReceiving==", ITCreated);
              var errorIT = ITCreated.error;
              //fail
              if (errorIT) {
                //update bo so lines with error
                updateErrorSoLinesRecord(
                  bulkSO.rec_id,
                  "receiving",
                  "",
                  "",
                  lineItemDetails,
                  payload.messageId,
                  ITCreated
                );
                responseObj.status = 0;
                responseObj.message = "fail";
                responseObj.details = [
                  {
                    receiving_date: payload.received_lmh_date,
                    message: "INVENTORY_TRANSFER_NOT_CREATED",
                    error: ITCreated,
                  },
                ];
                log.debug("responseObj==", responseObj);
                return responseObj;
              }
              //sucess
              //update all the lines with date,qty and IT
              var updatedSO = updateSoLinesRecord(
                ITCreated.bulk_so_id,
                "receiving",
                payload.received_lmh_date,
                ITCreated.ns_inventory_transfer_id,
                ITCreated.item_details,
                payload.messageId,
                standardTime
              );

              responseObj.status = 1;
              responseObj.message = "success";
              responseObj.details = [
                {
                  ns_inventory_transfer_id: ITCreated.ns_inventory_transfer_id,
                  receiving_date: payload.received_lmh_date,
                  message: "Receiving Date Updated In NetSuite",
                },
              ];
              log.debug("responseObjReceiving==", responseObj);
              return responseObj;
            }
          }
          //Case: If IT exists create IT and stamp error on SO Lines
          else {
            ITCreated = createITInNetSuite(
              payload.received_lmh_date,
              "receiving",
              orderId /* payload.order_id */,
              lineItemDetails,
              standardTime
            );
            log.debug("ITCreatedReceiving==", ITCreated);
            var errorIT = ITCreated.error;
            //fail
            if (errorIT) {
              //update bo so lines with error
              updateErrorSoLinesRecord(
                bulkSO.rec_id,
                "receiving",
                "",
                "",
                lineItemDetails,
                "notupdate",
                ITCreated
              );
              responseObj.status = 0;
              responseObj.message = "fail";
              responseObj.details = [
                {
                  receiving_date: payload.received_lmh_date,
                  message: "INVENTORY_TRANSFER_NOT_CREATED",
                  error: ITCreated,
                },
              ];
              log.debug("responseObj==", responseObj);
              return responseObj;
            }
          }
        }
        //Case3: Installation Operation
        if (payload.installation_date && iit == false) {
          log.debug("Case3", "Installation Operation..");
          //check IT is created or not. If created then create only IT and stamp error.Else update the so lines and then create IT
          //get the bulk parent id
          var parentRecId = bulkSO.parent_rec_id;
          var externalId = "";
          if (parentRecId) {
            var parentRecObj = search.lookupFields({
              type: "customrecord_bulk",
              id: parentRecId,
              columns: [
                "custrecord_bo_num",
                "name",
                "custrecord_bo_in_transit_location",
                "custrecord_bo_to_location",
              ],
            });
            externalId = parentRecObj.custrecord_bo_num + "_" + orderId + "-I";
          }

          //create itemfulfillment by transforming Sales Order
          var salesOrderId = bulkSO.sales_order_id;
          log.debug("Transforming SO#" + salesOrderId, "For Fulfilment");

          //validate for the unexpected data
          var cd = installationDate.toString().includes("-");
          log.debug("cdid==", cd);
          if (cd == false) {
            //update BO SO lines with error details
            var updatedSO1 = updateErrorSoLinesRecord(
              bulkSO.rec_id,
              "installation",
              "",
              "",
              lineItemDetails,
              payload.messageId,
              payload
            );

            responseObj.status = 0;
            responseObj.message = "fail";
            responseObj.details = [
              { message: "INVALID_PAYLOAD", error: payload },
            ];
            log.debug("responseObj==", responseObj);
            return responseObj;
          }
          if (cd == true) {
            //check for valid date data or not(yyyy-mm-dd)
            var vd = new Date(installationDate);
            log.debug("vdid==", vd);
            if (vd == "Invalid Date" || !vd) {
              //update BO SO lines with error details
              var updatedSO1 = updateErrorSoLinesRecord(
                bulkSO.rec_id,
                "installation",
                "",
                "",
                lineItemDetails,
                payload.messageId,
                payload
              );

              responseObj.status = 0;
              responseObj.message = "fail";
              responseObj.details = [
                { message: "INVALID_PAYLOAD", error: payload },
              ];
              log.debug("responseObj==", responseObj);
              return responseObj;
            }
            //sucess
            //first update so lines
            var updatedSO = updateSoLinesRecord(
              bulkSO.rec_id,
              "installation",
              payload.installation_date,
              "",
              lineItemDetails,
              payload.messageId,
              standardTime
            );

            //create itemfulfilment
            var ifCreated = createItemFulfilment(
              parentRecObj,
              salesOrderId,
              lineItemDetails,
              standardTime,
              payload.installation_date,
              bulkSO.rec_id,
              orderId,
              payload
            );
            log.debug("ifCreated==", ifCreated);
            var errorIF = ifCreated.error;
            //fail
            if (errorIF) {
              //update bo so lines with error
              updateErrorSoLinesRecord(
                bulkSO.rec_id,
                "installation",
                "",
                "",
                lineItemDetails,
                payload.messageId,
                ifCreated
              );
              responseObj.status = 0;
              responseObj.message = "fail";
              responseObj.details = [
                {
                  installation_date: payload.installation_date,
                  message: "ITEM_FULFILMENT_NOT_CREATED",
                  error: ifCreated,
                },
              ];
              log.debug("responseObj==", responseObj);
              return responseObj;
            }
            //sucess
            //update all the lines with date,qty and IF
            var updatedSO = updateSoLinesRecord(
              ifCreated.bulk_so_id,
              "installation",
              payload.installation_date,
              ifCreated.ns_itemfulfilment_id,
              ifCreated.item_details,
              payload.messageId,
              standardTime
            );

            responseObj.status = 1;
            responseObj.message = "success";
            responseObj.details = [
              {
                ns_itemfulfilment_id: ifCreated.ns_itemfulfilment_id,
                installation_date: payload.installation_date,
                message: "Installation Date Updated In NetSuite",
                sales_order_line_changed: ifCreated.sales_order_line_changed,
              },
            ];
            log.debug("responseObjInstallation==", responseObj);
            return responseObj;
          }
        }
        //for any other case throw error
        else {
          log.debug("NOTHING TO DO", "THROW ERROR");
          updateErrorSoLinesRecord(
            bulkSO.rec_id,
            "",
            "",
            "",
            lineItemDetails,
            payload.messageId,
            payload
          );
          responseObj.status = 0;
          (responseObj.message = "fail"),
            (responseObj.details = [
              { message: "INVALID_PAYLOAD", error: payload },
            ]);
          log.debug("responseObj==", responseObj);
          return responseObj;
        }
      }
    } catch (error) {
      log.error("Main Exception", error);
      responseObj.status = 0;
      (responseObj.message = "fail"),
        (responseObj.details = [
          { message: error.name, details: error.message },
        ]);
      log.debug("responseObj==", responseObj);
      return responseObj;
    }
  }

  //function to create the IT in NetSuite
  function createITInNetSuite(
    date,
    type,
    orderId,
    lineItemDetails,
    standardTime
  ) {
    try {
      //convert date from GMT/UTC to PST/PDT
      /* var PSTPSDDATE = gmtToPst(date,standardTime);

            log.debug('PSTPSDDATE SET==',PSTPSDDATE);  */

      var ESTDATE = new Date(date.split("T")[0]);

      log.debug("ESTDATE SET==", ESTDATE);

      //get the record(Bulk Sales Order) by orderId param
      var bulkSO = getBulkSalesOrder(orderId);
      log.debug("bulkSO==", bulkSO);
      var error = bulkSO.error;
      //fail case
      if (error) {
        return bulkSO;
      }
      //success case
      else if (error == undefined) {
        var bulkSORecId = bulkSO.rec_id;

        //get the bulk parent id
        var parentRecId = bulkSO.parent_rec_id;
        if (parentRecId) {
          var parentRecObj = search.lookupFields({
            type: "customrecord_bulk",
            id: parentRecId,
            columns: [
              "custrecord_bo_num",
              "name",
              "custrecord_bo_in_transit_location",
              "custrecord_bo_to_location",
            ],
          });
        }

        log.debug("parentRecObj==", parentRecObj);

        var itObj = record.create({
          type: record.Type.INVENTORY_TRANSFER,
          isDynamic: true,
        });

        //set CUSTOMER ORDER NO
        itObj.setValue("custbody_customer_order_no", orderId);

        //set Bulk Order No
        itObj.setValue(
          "custbody_tonal_bulk_order_no",
          parentRecObj.custrecord_bo_num
        );

        //set BULK ORDER NUMBER List
        itObj.setValue("custbody_ns_bulk_order_no", parentRecId);

        //set subsidiary
        itObj.setValue("subsidiary", 1); //default

        //set trandate
        itObj.setValue(
          "trandate",
          ESTDATE /* PSTPSDDATE */ /* new Date(date) */
        );

        //set sales order
        itObj.setValue("custbody_customer_so", bulkSO.sales_order_id);

        //based on type parameter decide which date needs to stamp on bo sales order lines along with IT details
        if (type == "delivery") {
          //intransit - doc

          //set type
          itObj.setValue("custbody_inventory_transfer_type", 2);

          //set externalid
          itObj.setValue(
            "externalid",
            parentRecObj.custrecord_bo_num + "_" + orderId + "-D"
          );

          //get the from location (intransit-location) from the BULK PARENT
          var fromloc = parentRecObj.custrecord_bo_in_transit_location[0].value;

          //get the to location from the BULK PARENT
          var toloc =
            parentRecObj.custrecord_bo_to_location[0].text.toLowerCase();

          //check for the it include RYDER or XPO in the text
          var isXpo = toloc.includes("xpo");

          var isRyder = toloc.includes("ryder");

          if (isXpo == true) {
            toloc = "XPO_Dock";
          } else if (isRyder == true) {
            toloc = "Ryder_Dock";
          }

          log.debug("toloc==", toloc);

          //get the location by to location(externalid)
          var toLocId = getLocationByExternalId(toloc);
          //fail
          if (typeof toLocId == "object") {
            return toLocId;
          }
          //sucess
          //set from location
          itObj.setValue("location", fromloc);

          //set tolocation
          itObj.setValue("transferlocation", toLocId);
        }

        if (type == "receiving") {
          //doc - lmh

          //set type
          itObj.setValue("custbody_inventory_transfer_type", 3);

          //set externalid
          itObj.setValue(
            "externalid",
            parentRecObj.custrecord_bo_num + "_" + orderId + "-R"
          );

          //get the from location from the BULK PARENT
          var fromloc =
            parentRecObj.custrecord_bo_to_location[0].text.toLowerCase();

          //get the to location from the BULK PARENT
          var toloc = parentRecObj.custrecord_bo_to_location[0].value;

          //check for the it include RYDER or XPO in the text
          var isXpo = fromloc.includes("xpo");

          var isRyder = fromloc.includes("ryder");

          if (isXpo == true) {
            fromloc = "XPO_Dock";
          } else if (isRyder == true) {
            fromloc = "Ryder_Dock";
          }

          log.debug("fromloc==", fromloc);

          //get the location by to location(externalid)
          fromloc = getLocationByExternalId(fromloc);
          //fail
          if (typeof fromloc == "object") {
            return fromloc;
          }
          //sucess
          log.debug("fromloc==" + fromloc, "toloc==" + toloc);
          //set from location
          itObj.setValue("location", fromloc);

          //set tolocation
          itObj.setValue("transferlocation", toloc);
        }

        if (type == "installation") {
          //lmh - pending activation

          //set type
          itObj.setValue("custbody_inventory_transfer_type", 4);

          //set externalid
          itObj.setValue(
            "externalid",
            parentRecObj.custrecord_bo_num + "_" + orderId + "-I"
          );

          //get the from location from the BULK PARENT
          var fromloc = parentRecObj.custrecord_bo_to_location[0].value;

          //get the to location is always Pending Activation(Pending_Activation)
          //get the location by to location(externalid)
          var toloc = getLocationByExternalId("Pending_Activation");
          log.debug("toloc==", toloc);
          //fail
          if (typeof toloc == "object") {
            return toloc;
          }
          //sucess
          log.debug("fromloc==" + fromloc, "toloc==" + toloc);
          //set from location
          itObj.setValue("location", fromloc);

          //set tolocation
          itObj.setValue("transferlocation", toloc);
        }

        //set the line items on IT,to do that load the bulk sales order and get the line details with item,qty
        /* var lineItemDetails = getBulkSoLineDetails(bulkSORecId);
                log.debug('lineItemDetails==',lineItemDetails);
                //fail
                var errorBL = lineItemDetails.error;
                if(errorBL){
                    return errorBL;
                } */
        //success
        lineItemDetails = lineItemDetails; //.item_details;

        for (var x = 0; x < lineItemDetails.length; x++) {
          itObj.selectNewLine({
            sublistId: "inventory",
          });

          itObj.setCurrentSublistValue({
            sublistId: "inventory",
            fieldId: "item",
            value: lineItemDetails[x].item_id,
          });

          itObj.setCurrentSublistValue({
            sublistId: "inventory",
            fieldId: "adjustqtyby",
            value: lineItemDetails[x].item_quantity,
          });

          itObj.commitLine({
            sublistId: "inventory",
          });
        }

        var newITRecId = itObj.save();
        if (newITRecId) {
          log.debug("New IT Created==", newITRecId);
          return {
            message: "success",
            ns_inventory_transfer_id: Number(newITRecId),
            item_details: lineItemDetails,
            bulk_so_id: bulkSORecId,
          };
        }
      }
    } catch (error) {
      log.error("Error : In Create IT In NetSuite", error);
      //check for the message string length
      var err = error.message;
      if (err.length > 290) {
        err = error.name;
      }
      return { error: error.name, message: err };
    }
  }

  //function to get the bulk sales order
  function getBulkSalesOrder(orderId) {
    try {
      var customrecord_bulk_sales_orderSearchObj = search.create({
        type: "customrecord_bulk_sales_order",
        filters: [
          ["isinactive", "is", "F"],
          "AND",
          ["custrecord_bo_so_customer_order_no", "is", orderId],
        ],
        columns: [
          search.createColumn({
            name: "name",
            sort: search.Sort.ASC,
            label: "Name",
          }),
          search.createColumn({
            name: "custrecord_bo_so_sales_order",
            label: "Sales Order",
          }),
          search.createColumn({
            name: "custrecord_bo_so_customer_order_no",
            label: "Customer Order No",
          }),
          search.createColumn({
            name: "custrecord_bo_so_parent",
            label: "BO SO Parent",
          }),
        ],
      });
      var searchResultCount =
        customrecord_bulk_sales_orderSearchObj.runPaged().count;
      log.debug("Bulk Slaes Order Count", searchResultCount);
      var recId = "",
        obj = {};
      if (searchResultCount > 0) {
        customrecord_bulk_sales_orderSearchObj.run().each(function (result) {
          recId = Number(result.id);
          obj.rec_id = result.id;
          obj.parent_rec_id = result.getValue("custrecord_bo_so_parent");
          obj.sales_order_id = result.getValue("custrecord_bo_so_sales_order");
          return true;
        });
        return obj;
      } else {
        return { error: orderId, message: "No Bulk SalesOrder Found" };
      }
    } catch (error) {
      log.error("Error : In Get Bulk Sales Order", error);
      return { error: error.name, message: error.message };
    }
  }

  //function to get the location by externalid
  function getLocationByExternalId(externalid) {
    try {
      var locationSearchObj = search.create({
        type: "location",
        filters: [
          /*  ["isinactive","is","F"], 
                   "AND", */
          ["externalid", "is", externalid],
        ],
        columns: [
          search.createColumn({
            name: "name",
            sort: search.Sort.ASC,
            label: "Name",
          }),
          search.createColumn({ name: "phone", label: "Phone" }),
          search.createColumn({ name: "city", label: "City" }),
          search.createColumn({ name: "state", label: "State/Province" }),
          search.createColumn({ name: "country", label: "Country" }),
          search.createColumn({
            name: "custrecordwoo_retail_store_key",
            label: "WooCommerce Retail Store KEY",
          }),
          search.createColumn({
            name: "custrecord_so_dept",
            label: "Sales Department  ",
          }),
        ],
      });
      var searchResultCount = locationSearchObj.runPaged().count;
      log.debug("Location count", searchResultCount);
      var locId = "";
      locationSearchObj.run().each(function (result) {
        locId = Number(result.id);
        return true;
      });
      return locId;
    } catch (error) {
      log.error("Error : In Get Location", error);
      return { error: error.name, message: error.message };
    }
  }

  //function to get the bulk sales order line details
  function getBulkSoLineDetails(recId /* customerOrderId,parentRecId */) {
    try {
      var customrecord_bulk_sales_orderSearchObj = search.create({
        type: "customrecord_bulk_sales_order",
        filters: [
          ["isinactive", "is", "F"],
          "AND",
          ["internalid", "anyof", recId],
        ],
        columns: [
          search.createColumn({
            name: "name",
            sort: search.Sort.ASC,
            label: "Name",
          }),
          search.createColumn({
            name: "custrecord_bo_so_sales_order",
            label: "Sales Order",
          }),
          search.createColumn({
            name: "custrecord_bo_so_customer_order_no",
            label: "Customer Order No",
          }),
          search.createColumn({
            name: "custrecord_bo_so_parent",
            label: "BO SO Parent",
          }),
          search.createColumn({
            name: "custrecord_bo_so_line_released_qty",
            join: "CUSTRECORD_BO_SO_LINE_PARENT",
            label: "Released Qty",
          }),
          search.createColumn({
            name: "custrecord_bo_so_line_num",
            join: "CUSTRECORD_BO_SO_LINE_PARENT",
            label: "Order Line #",
          }),
          search.createColumn({
            name: "custrecord_bo_so_line_item",
            join: "CUSTRECORD_BO_SO_LINE_PARENT",
            label: "Item",
          }),
          search.createColumn({
            name: "name",
            join: "CUSTRECORD_BO_SO_LINE_PARENT",
            label: "Name",
          }),
          search.createColumn({
            name: "internalid",
            join: "CUSTRECORD_BO_SO_LINE_PARENT",
            label: "Internal ID",
          }),
          search.createColumn({
            name: "custrecord_bo_so_line_shipped_qty",
            join: "CUSTRECORD_BO_SO_LINE_PARENT",
            label: "Shipped Qty",
          }),
        ],
      });
      var searchResultCount =
        customrecord_bulk_sales_orderSearchObj.runPaged().count;
      log.debug("Bulk SO Line Count", searchResultCount);
      var lineDetails = [],
        isShipedQty = false,
        isReleasedQty = false,
        sQtyArray = [],
        rQtyArray = [];
      customrecord_bulk_sales_orderSearchObj.run().each(function (result) {
        //check for the shipped qty first if it having value greater than 0 then take it
        //else take the received qty
        var sQty = result.getValue({
          name: "custrecord_bo_so_line_shipped_qty",
          join: "CUSTRECORD_BO_SO_LINE_PARENT",
        });
        if (sQty) {
          // isShipedQty = true;
          // return false;
          sQtyArray.push({
            parent_rec_id: result.getValue({
              name: "name",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
            child_rec_id: result.id,
            grand_clid_rec_id: result.getValue({
              name: "internalid",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
            item_id: result.getValue({
              name: "custrecord_bo_so_line_item",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
            item_quantity: result.getValue({
              name: "custrecord_bo_so_line_shipped_qty",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
          });
        }
        var releasedQty = result.getValue({
          name: "custrecord_bo_so_line_released_qty",
          join: "CUSTRECORD_BO_SO_LINE_PARENT",
        });
        if (releasedQty) {
          // isReleasedQty = true;
          // return false;
          rQtyArray.push({
            parent_rec_id: result.getValue({
              name: "name",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
            child_rec_id: result.id,
            grand_clid_rec_id: result.getValue({
              name: "internalid",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
            item_id: result.getValue({
              name: "custrecord_bo_so_line_item",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
            item_quantity: result.getValue({
              name: "custrecord_bo_so_line_released_qty",
              join: "CUSTRECORD_BO_SO_LINE_PARENT",
            }),
          });
        }
        return true;
      });

      // log.debug('isShipedQty=='+isShipedQty,'isReleasedQty=='+isReleasedQty);
      log.debug("rQtyArray==", rQtyArray);
      log.debug("sQtyArray==", sQtyArray);
      //check if sQtyArray having value then return that else return rQtyArray
      if (sQtyArray.length > 0) {
        return { item_details: sQtyArray };
      } else if (rQtyArray.length > 0) {
        return { item_details: rQtyArray };
      }
      //check flage for shipped qty and released qty
      /* customrecord_bulk_sales_orderSearchObj.run().each(function(result){
                if(isReleasedQty == true){
                    var releasedQty = Number(result.getValue({ name: "custrecord_bo_so_line_released_qty", join: "CUSTRECORD_BO_SO_LINE_PARENT"}));
                    if(releasedQty || releasedQty > Number(0)){
                        lineDetails.push({
                            parent_rec_id:result.getValue({name: "name", join: "CUSTRECORD_BO_SO_LINE_PARENT"}),
                            child_rec_id:result.id,
                            grand_clid_rec_id:result.getValue({name: "internalid", join: "CUSTRECORD_BO_SO_LINE_PARENT"}),
                            item_id:result.getValue({name: "custrecord_bo_so_line_item", join: "CUSTRECORD_BO_SO_LINE_PARENT"}),
                            item_quantity:result.getValue({ name: "custrecord_bo_so_line_released_qty", join: "CUSTRECORD_BO_SO_LINE_PARENT"})
                        });
                    }
                }
                else if(isShipedQty == true){
                    var shipQty = Number(result.getValue({ name: "custrecord_bo_so_line_shipped_qty", join: "CUSTRECORD_BO_SO_LINE_PARENT"}));
                    if(shipQty || shipQty > Number(0)){
                        lineDetails.push({
                            parent_rec_id:result.getValue({name: "name", join: "CUSTRECORD_BO_SO_LINE_PARENT"}),
                            child_rec_id:result.id,
                            grand_clid_rec_id:result.getValue({name: "internalid", join: "CUSTRECORD_BO_SO_LINE_PARENT"}),
                            item_id:result.getValue({name: "custrecord_bo_so_line_item", join: "CUSTRECORD_BO_SO_LINE_PARENT"}),
                            item_quantity:result.getValue({ name: "custrecord_bo_so_line_shipped_qty", join: "CUSTRECORD_BO_SO_LINE_PARENT"})
                        });
                    }
                   
                }
                return true;
            });
            return {item_details:lineDetails}; */
    } catch (error) {
      log.error("Error : In Get Bulk SoLineDetails", error);
      return { error: error.name, message: error.message };
    }
  }

  //function to update the all so line grand childwith qty, IT,date
  function updateSoLinesRecord(
    recId,
    type,
    date,
    itId,
    itemDetails,
    messageId,
    standardTime
  ) {
    try {
      //convert date from GMT/UTC to PST/PDT
      /* var PSTPSDDATE = gmtToPst(date,standardTime);

            log.debug('PSTPSDDATE SET==',PSTPSDDATE); */
      var ESTDATE = convertGMTToEST(date);
      log.debug("ESTDATE==", ESTDATE);
      ESTDATE = format.format({
        value: new Date(ESTDATE),
        type: format.Type.DATE,
      });

      log.debug("ESTDATE SET==", ESTDATE);

      var recObj = record.load({
        type: "customrecord_bulk_sales_order",
        id: recId,
        isDynamic: true,
      });

      var lineCount = recObj.getLineCount({
        sublistId: "recmachcustrecord_bo_so_line_parent",
      });
      log.debug("bulkSoLineCount==", lineCount);

      for (var l = 0; l < lineCount; l++) {
        var nsItemId = recObj.getSublistValue({
          sublistId: "recmachcustrecord_bo_so_line_parent",
          fieldId: "custrecord_bo_so_line_item",
          line: l,
        });

        for (var x = 0; x < itemDetails.length; x++) {
          var iTItem = itemDetails[x].item_id;
          //matched items
          if (nsItemId == iTItem) {
            recObj.selectLine({
              sublistId: "recmachcustrecord_bo_so_line_parent",
              line: l,
            });

            if (type == "delivery") {
              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_delivered_qty",
                value: itemDetails[x].item_quantity,
              });

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_delivery_date",
                value: new Date(ESTDATE) /* PSTPSDDATE */, //new Date(date)
              });

              if (itId) {
                recObj.setCurrentSublistValue({
                  sublistId: "recmachcustrecord_bo_so_line_parent",
                  fieldId: "custrecord_bo_so_line_delivery_inv_trans",
                  value: itId,
                });
              }

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_delivery_file_name",
                value: messageId,
              });
            }
            if (type == "receiving") {
              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_received_qty",
                value: itemDetails[x].item_quantity,
              });

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_receipt_date",
                value: new Date(ESTDATE) /* PSTPSDDATE */, //new Date(date)
              });

              if (itId) {
                recObj.setCurrentSublistValue({
                  sublistId: "recmachcustrecord_bo_so_line_parent",
                  fieldId: "custrecord_bo_so_line_receipt_inv_trans",
                  value: itId,
                });
              }

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_receipt_file_name",
                value: messageId,
              });
            }
            if (type == "installation") {
              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_installed_qty",
                value: itemDetails[x].item_quantity,
              });

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_installation_date",
                value: new Date(ESTDATE) /* PSTPSDDATE */, //new Date(date)
              });

              if (itId) {
                recObj.setCurrentSublistValue({
                  sublistId: "recmachcustrecord_bo_so_line_parent",
                  fieldId:
                    "custrecord_bo_so_line_install_if" /* 'custrecord_bo_so_line_install_inv_trans', */,
                  value: itId,
                });
              }

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_install_file_name",
                value: messageId,
              });
            }

            recObj.setCurrentSublistValue({
              sublistId: "recmachcustrecord_bo_so_line_parent",
              fieldId: "custrecord_bo_so_line_error_msg",
              value: "",
            });

            recObj.commitLine({
              sublistId: "recmachcustrecord_bo_so_line_parent",
            });

            break;
          }
        }
      }
      var Id = recObj.save();
      if (Id) {
        log.debug("So Lines Updated==", Id);
        return Number(Id);
      }
    } catch (error) {
      log.error("Error : In Update SoLinesRecord", error);
      return { error: error.name, message: error.message };
    }
  }

  //function to update the all so line with error
  function updateErrorSoLinesRecord(
    recId,
    type,
    date,
    itId,
    itemDetails,
    messageId,
    errorDetail
  ) {
    try {
      var recObj = record.load({
        type: "customrecord_bulk_sales_order",
        id: recId,
        isDynamic: true,
      });

      var lineCount = recObj.getLineCount({
        sublistId: "recmachcustrecord_bo_so_line_parent",
      });
      log.debug("bulkSoLineCount==", lineCount);

      for (var l = 0; l < lineCount; l++) {
        var nsItemId = recObj.getSublistValue({
          sublistId: "recmachcustrecord_bo_so_line_parent",
          fieldId: "custrecord_bo_so_line_item",
          line: l,
        });

        for (var x = 0; x < itemDetails.length; x++) {
          var iTItem = itemDetails[x].item_id;
          //matched items
          if (nsItemId == iTItem) {
            recObj.selectLine({
              sublistId: "recmachcustrecord_bo_so_line_parent",
              line: l,
            });

            recObj.setCurrentSublistValue({
              sublistId: "recmachcustrecord_bo_so_line_parent",
              fieldId: "custrecord_bo_so_line_error_msg",
              value: JSON.stringify(errorDetail),
            });

            if (type == "delivery" && messageId != "notupdate") {
              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_delivery_file_name",
                value: messageId,
              });

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_delivered_qty",
                value: "",
              });
            }

            if (type == "receiving" && messageId != "notupdate") {
              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_receipt_file_name",
                value: messageId,
              });

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_received_qty",
                value: "",
              });
            }

            if (type == "installation" && messageId != "notupdate") {
              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_install_file_name",
                value: messageId,
              });

              recObj.setCurrentSublistValue({
                sublistId: "recmachcustrecord_bo_so_line_parent",
                fieldId: "custrecord_bo_so_line_installed_qty",
                value: "",
              });
            }

            recObj.commitLine({
              sublistId: "recmachcustrecord_bo_so_line_parent",
            });

            break;
          }
        }
      }
      var recid = recObj.save();
      if (recid) {
        log.debug("Record Updated With Error Details", recid);
      }
    } catch (error) {
      log.error("Error : In Update Error So Lines", error);
    }
  }

  //function to get the Inventory transfer avilable in NS with externalId
  function getITExist(externalId) {
    try {
      var inventorytransferSearchObj = search.create({
        type: "inventorytransfer",
        filters: [
          ["type", "anyof", "InvTrnfr"],
          "AND",
          ["mainline", "is", "T"],
          "AND",
          ["externalid", "anyof", externalId],
        ],
        columns: [
          search.createColumn({ name: "tranid", label: "Document Number" }),
          search.createColumn({ name: "externalid", label: "External ID" }),
        ],
      });
      var searchResultCount = inventorytransferSearchObj.runPaged().count;
      log.debug("IT Count WIth ExternalId", searchResultCount);
      var itId = false;
      inventorytransferSearchObj.run().each(function (result) {
        itId = result.id;
        return true;
      });
      return itId;
    } catch (error) {
      log.error("Error : Error In Get IT Exists", error);
      return false;
    }
  }

  //function to convert GMT/UTC to PST/PDT
  function gmtToPst(date, standardTime) {
    try {
      if (standardTime) {
        var offset = 420; //PST 7 hours behind the UTC/GMT in munutes(7*60=420)
      } else if (!standardTime) {
        var offset = 480; //PDT 8 hours behind the UTC/GMT in munutes(8*60=480)
      }
      var offsetMillis = offset * 60 * 1000;
      var today = new Date(date);
      var millis = today.getTime();
      var timeZoneOffset = today.getTimezoneOffset() * 60 * 1000;

      var pst = millis - offsetMillis;
      var currentDate = new Date(pst);

      // log.debug("PST Time : " , currentDate.toUTCString());
      // log.debug("Local Time : " , new Date(today.getTime() - timeZoneOffset).toUTCString());

      return currentDate;
    } catch (error) {
      log.error("Error : In GMT To PST", error);
    }
  }

  //function to check any process IT created or not
  function getITCreatedForAnyProcess(process, bulkSOId) {
    try {
      var D_IT_CREATED = false,
        R_IT_CREATED = false,
        I_IT_CREATED = false;
      var recObj = record.load({
        type: "customrecord_bulk_sales_order",
        id: bulkSOId,
        isDynamic: true,
      });

      var lineCount = recObj.getLineCount(
        "recmachcustrecord_bo_so_line_parent"
      );
      for (var x = 0; x < lineCount; x++) {
        if (process == "delivery") {
          /*  var dit =  recObj.getSublistValue('recmachcustrecord_bo_so_line_parent','custrecord_bo_so_line_delivery_inv_trans',x);
                    if(dit){ */
          var ditdate = recObj.getSublistValue(
            "recmachcustrecord_bo_so_line_parent",
            "custrecord_bo_so_line_delivery_date",
            x
          );
          if (ditdate) {
            D_IT_CREATED = true;
          }
        }
        if (process == "receiving") {
          /*  var rit =  recObj.getSublistValue('recmachcustrecord_bo_so_line_parent','custrecord_bo_so_line_receipt_inv_trans',x);
                    if(rit){ */
          var ritdate = recObj.getSublistValue(
            "recmachcustrecord_bo_so_line_parent",
            "custrecord_bo_so_line_receipt_date",
            x
          );
          if (ritdate) {
            R_IT_CREATED = true;
          }
        }
        if (process == "installation") {
          /* var iit =  recObj.getSublistValue('recmachcustrecord_bo_so_line_parent','custrecord_bo_so_line_install_inv_trans',x);
                    if(iit){ */
          var iitdate = recObj.getSublistValue(
            "recmachcustrecord_bo_so_line_parent",
            "custrecord_bo_so_line_installation_date",
            x
          );
          if (iitdate) {
            I_IT_CREATED = true;
          }
        }
      }
      return {
        d_it_created: D_IT_CREATED,
        r_it_created: R_IT_CREATED,
        i_it_created: I_IT_CREATED,
      };
    } catch (error) {
      log.error("Error : In Get IT Created For Any Process", error);
      return false;
    }
  }

  //function to create the ITEM FULFILMENT
  function createItemFulfilment(
    bulkObj,
    salesOrderId,
    lineItemDetails,
    standardTime,
    date,
    bulkSORecId,
    orderId,
    payload
  ) {
    try {
      //get the trainer sku form the script parameter
      var scriptObj = runtime.getCurrentScript();
      var trainerSkus = scriptObj.getParameter("custscript_trainer_skus");
      trainerSkus = trainerSkus.split(",");
      log.debug("trainerSkus==" + trainerSkus.length, trainerSkus);

      var payloadSkus = payload.SKU_Details;
      var sku = "";

      //first swap the item on SO the transform the SO for IF
      var soRec = record.load({
        type: "salesorder",
        id: salesOrderId,
      });

      let saleslocation = soRec.getValue("location");
      log.debug("saleslocation==", saleslocation);

      var soLineCount = soRec.getLineCount({ sublistId: "item" });
      var lineChanged = false;

      var salesOrderLocation = soRec.getValue({
        fieldId: "location",
      });

      // Swap Items On Sales Order As Needed
      // This is very hard-coded for now and can be changed later if needed
      // PRODUCTION
      var itemSwapObjT1 = {
        50: 1696, //T00001-1 : T00001-1-3
        1410: 1695, //T00001-1-2 : T00001-1-4
        1332: 52, //T00001.2 - T800 : T00001.2
        1343: 53, //T00001.4 - T800 : T00001.4
      };
      var itemSwapObjT800 = {
        1696: 50,
        1695: 1410,
        52: 1332,
        53: 1343,
      };

      /*  50 - T00001-1
            52 - T00001.2
            53 - T00001.4
            1332 - T00001.2 - T800
            1343 - T00001.4 - T800
            1713 - TL Halter High Neck Bra XS S M L XL 26 60 60 50 4-Navy */

      //get the bulkso lines
      var bulkSoLineCount = soRec.getLineCount(
        "recmachcustrecord_bo_so_line_so_parent"
      );
      log.debug("bulkSoLineCount==", bulkSoLineCount);
      var boSoItems = [];
      for (var bosol = 0; bosol < bulkSoLineCount; bosol++) {
        var trainer = soRec
          .getSublistText(
            "recmachcustrecord_bo_so_line_so_parent",
            "custrecord_bo_so_line_item",
            bosol
          )
          .toUpperCase();
        if (trainer.includes("TRAINER")) {
          boSoItems.push({
            item_id: soRec.getSublistValue(
              "recmachcustrecord_bo_so_line_so_parent",
              "custrecord_bo_so_line_item",
              bosol
            ),
            member_item: search.lookupFields({
              type: search.Type.ITEM,
              id: soRec.getSublistValue(
                "recmachcustrecord_bo_so_line_so_parent",
                "custrecord_bo_so_line_item",
                bosol
              ),
              columns: ["itemid"],
            }).itemid,
          });
        }
      }

      log.debug("boSoItems==" + boSoItems.length, boSoItems);

      for (var i = 0; i < soLineCount; i++) {
        var cItem = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "item",
          line: i,
        });
        var curAmount = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "amount",
          line: i,
        });
        var curQuantity = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "quantity",
          line: i,
        });
        var curRate = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "rate",
          line: i,
        });

        // log.debug({title:'CItem', details: cItem});
        if (
          [50, 52, 53, 1332, 1343, 1713, 1410 /* ,2624 */].indexOf(
            parseInt(cItem)
          ) > -1
        ) {
          // log.debug({title:'Is In Array', details:'IN ARRAY'});

          //check item conatins member sku of trainer or not if not, if matching now SO item swap else SO item Swap based on below criteria
          //then check for the which trainer sku is not matching from the script parmeter trainer skus and item's member skus
          // var sku = '';

          var itemMembers = getItemMemberTrainerSku(cItem, false);
          log.debug("itemMembers==" + itemMembers.length, itemMembers);

          //s1. check item member conatins member trainer sku matches with boso line trainer sku
          var trainerSkuMathces = getMatchedSku(itemMembers, boSoItems);
          log.debug(
            "trainerSkuMathces==" + trainerSkuMathces.length,
            trainerSkuMathces
          );

          if (trainerSkuMathces.length == 0) {
            //s2. check which trainer sku not matches
            var indexT1 = boSoItems.findIndex(function (obj) {
              return obj.member_item == trainerSkus[0];
            });

            var indexT2 = boSoItems.findIndex(function (obj) {
              return obj.member_item == trainerSkus[1];
            });

            var indexT3 = boSoItems.findIndex(function (obj) {
              return obj.member_item == trainerSkus[2];
            });

            if (indexT1 != -1) {
              sku = trainerSkus[0];
            } else if (indexT2 != -1) {
              sku = trainerSkus[1];
            } else if (indexT3 != -1) {
              sku = trainerSkus[2];
            }

            log.debug("sku==", sku);

            if (sku == trainerSkus[0]) {
              // log.debug({title:'SKU is 100-0001', details:sku});
              if (itemSwapObjT1.hasOwnProperty(cItem)) {
                // log.debug({title:'Swapping Item', details:'Swapping'});
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "item",
                  line: i,
                  value: itemSwapObjT1[cItem],
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "quantity",
                  line: i,
                  value: curQuantity,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "rate",
                  line: i,
                  value: curRate,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "amount",
                  line: i,
                  value: curAmount,
                });
                lineChanged = true;
              }
            } else if (sku == trainerSkus[1]) {
              // log.debug({title:'SKU is 100-0002', details:sku});
              if (itemSwapObjT800.hasOwnProperty(cItem)) {
                // log.debug({title:'Swapping Item', details:'Swapping'});
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "item",
                  line: i,
                  value: itemSwapObjT800[cItem],
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "quantity",
                  line: i,
                  value: curQuantity,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "rate",
                  line: i,
                  value: curRate,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "amount",
                  line: i,
                  value: curAmount,
                });
                lineChanged = true;
              }
            }
          }
        }
      }

      log.debug("SOLINECHANGED==", lineChanged);

      // Save SO only if line was changed
      if (lineChanged) {
        var soId = soRec.save({ ignoreMandatoryFields: true });
        if (soId) {
          log.debug("Sales Order Updated With Line Swapping", soId);
        }
      }

      //convert date from GMT/UTC to PST/PDT
      /* var PSTPSDDATE = gmtToPst(date,standardTime);

            log.debug('PSTPSDDATE SET==',PSTPSDDATE);  */
      var ESTDATE = convertGMTToEST(date);
      log.debug("ESTDATE==", ESTDATE);
      ESTDATE = format.format({
        value: new Date(ESTDATE),
        type: format.Type.DATE,
      });

      log.debug("ESTDATE SET==", ESTDATE);

      if (!salesOrderLocation) {
        var ifObj = record.transform({
          fromType: record.Type.SALES_ORDER,
          fromId: salesOrderId,
          toType: record.Type.ITEM_FULFILLMENT,
          isDynamic: true,
        });

        //set trandate
        ifObj.setValue("trandate", new Date(ESTDATE) /* PSTPSDDATE */);

        //set sales order location
        ifObj.setValue({
          fieldId: "custbody_sales_order_location",
          value: salesOrderLocation,
        }); // Set Sales Order Location for Retail P&L GL Plugin

        //set memo
        ifObj.setValue({ fieldId: "memo", value: orderId });

        var ifLineCount = ifObj.getLineCount("item");
        log.debug("ifLineCount==", ifLineCount);
        for (var i = 0; i < ifLineCount; i++) {
          ifObj.selectLine({
            sublistId: "item",
            line: i,
          });

          //set receive true
          ifObj.setCurrentSublistValue("item", "itemreceive", true);

          //set location
          ifObj.setCurrentSublistValue(
            "item",
            "location",
            bulkObj.custrecord_bo_to_location[0].value
          );

          var itemType = ifObj.getCurrentSublistValue("item", "itemtype");

          if (
            itemType != "Service" &&
            itemType != "OthCharge" &&
            itemType != "Subtotal" &&
            itemType != "Payment"
          ) {
            //get the item qty from the fareye paylaod
            if (sku) {
              let index = payloadSkus.findIndex(function (obj) {
                return obj.SKU_Code == sku;
              });
              log.debug("paylaodSkuQty index==", index);

              if (index > -1) {
                ifObj.setCurrentSublistValue(
                  "item",
                  "quantity",
                  payloadSkus[index].SKU_Qty
                );
              }
            } else {
              //compare with boso lines and payload lines , to get the matched trainer
              for (let p in payloadSkus) {
                let index = boSoItems.findIndex(function (obj) {
                  return obj.member_item == payloadSkus[p].SKU_Code;
                });
                log.debug("else index==", index);
                if (index > -1) {
                  ifObj.setCurrentSublistValue(
                    "item",
                    "quantity",
                    payloadSkus[index].SKU_Qty
                  );
                }
                // break;
              }
            }

            ifObj.setCurrentSublistValue(
              "item",
              "custcol_tonal_serial_number",
              payload.serial_number
            );
          }

          ifObj.commitLine("item");
        }
      } else {
        log.debug("RUNNING WITH SO LOCATION IF CREATION");
        var ifObj = record.transform({
          fromType: record.Type.SALES_ORDER,
          fromId: salesOrderId,
          toType: record.Type.ITEM_FULFILLMENT,
          isDynamic: false,
        });

        //set trandate
        ifObj.setValue("trandate", new Date(ESTDATE) /* PSTPSDDATE */);

        //set sales order location
        ifObj.setValue({
          fieldId: "custbody_sales_order_location",
          value: salesOrderLocation,
        }); // Set Sales Order Location for Retail P&L GL Plugin

        //set memo
        ifObj.setValue({ fieldId: "memo", value: orderId });

        var ifLineCount = ifObj.getLineCount("item");
        log.debug("ifLineCount==", ifLineCount);
        for (var i = 0; i < ifLineCount; i++) {
          var itemType = ifObj.getSublistValue("item", "itemtype", i);

          //set location
          ifObj.setSublistValue(
            "item",
            "location",
            i,
            bulkObj.custrecord_bo_to_location[0].value
          );

          if (
            itemType != "Service" &&
            itemType != "OthCharge" &&
            itemType != "Subtotal" &&
            itemType != "Payment"
          ) {

            log.debug("debug sku=", sku);
            //get the item qty from the far eye paylaod
            if (sku) {
              let index = payloadSkus.findIndex(function (obj) {
                return obj.SKU_Code == sku;
              });
              log.debug("paylaodSkuQty index==", index);

              if (index > -1) {
                ifObj.setSublistValue(
                  "item",
                  "quantity",
                  i,
                  payloadSkus[index].SKU_Qty
                );
              }
            } else {
              //compare with boso lines and payload lines , to get the matched trainer
              for (let p in payloadSkus) {
                let index = boSoItems.findIndex(function (obj) {
                  return obj.member_item == payloadSkus[p].SKU_Code;
                });
                if (index > -1) {
                  ifObj.setSublistValue(
                    "item",
                    "quantity",
                    i,
                    payloadSkus[index].SKU_Qty
                  );
                }
                //break;
              }
            }

            // ifObj.setSublistValue('item','quantity',i,1/* payloadTrainerSku[0].SKU_Qty */);

            ifObj.setSublistValue(
              "item",
              "custcol_tonal_serial_number",
              i,
              payload.serial_number
            );
          }

          //set receive true
          ifObj.setSublistValue("item", "itemreceive", i, true);
        }
      }

      var newIfId = ifObj.save();
      if (newIfId) {
        log.debug("IF Created For SO#" + salesOrderId, "IF#" + newIfId);
        return {
          message: "success",
          ns_itemfulfilment_id: Number(newIfId),
          item_details: lineItemDetails,
          bulk_so_id: bulkSORecId,
          sales_order_line_changed: lineChanged,
        };
      }
    } catch (error) {
      log.error("Error : In Create IF In NetSuite", error);
      //check for the message string length
      var err = error.message;
      if (err.length > 290) {
        err = error.name;
      }
      return { error: error.name, message: err };
    }
  }

  //function to get the trainer member item
  function getItemMemberTrainerSku(itemId, isRyderOrder) {
    try {
      var itemSearchObj = search.create({
        type: "item",
        filters: [
          ["internalid", "anyof", itemId],
          "AND",
          ["isinactive", "is", "F"],
          /* "AND", 
                   ["memberitem.name","is","100-0002"] */
        ],
        columns: [
          search.createColumn({
            name: "itemid",
            sort: search.Sort.ASC,
            label: "Name",
          }),
          search.createColumn({ name: "displayname", label: "Display Name" }),
          search.createColumn({ name: "type", label: "Type" }),
          search.createColumn({ name: "memberitem", label: "Member Item" }),
          search.createColumn({
            name: "itemid",
            join: "memberItem",
            label: "Name",
          }),
        ],
      });
      var searchResultCount = itemSearchObj.runPaged().count;
      log.debug("Item Meber Count For Item# " + itemId, searchResultCount);
      var data = [];
      itemSearchObj.run().each(function (result) {
        if (isRyderOrder == true) {
          data.push({
            item_id: itemId,
            member_item_id: result.getValue({ name: "memberitem" }),
            member_item: result.getValue({
              name: "itemid",
              join: "memberItem",
            }),
            SKU_Code: result.getValue({ name: "itemid", join: "memberItem" }),
            SKU_Name: result.getValue({ name: "itemid", join: "memberItem" }),
          });
        } else {
          data.push({
            item_id: itemId,
            member_item_id: result.getValue({ name: "memberitem" }),
            member_item: result.getValue({
              name: "itemid",
              join: "memberItem",
            }),
          });
        }
        return true;
      });
      return data;
    } catch (error) {
      log.error("Error: In Get Item Member Trainer SKU", error);
      return [];
    }
  }

  //function to get the array of object by comparing 2 arary of object
  function getMatchedSku(itemArray1, itemArray2) {
    try {
      var props = ["item_id", "member_item", "member_item_id"];

      var result = itemArray1
        .filter(function (o1) {
          return itemArray2.some(function (o2) {
            return o1.member_item === o2.member_item;
          });
        })
        .map(function (o) {
          return props.reduce(function (newo, name) {
            newo[name] = o[name];
            return newo;
          }, {});
        });
      return result;
    } catch (error) {
      log.error("Error : In Get Matched Sku", error);
      return [];
    }
  }

  //function to return the response
  function returnResponse(status, message, errorMessage, errorName, orderId) {
    try {
      var responseObj = {};
      if (status == 0) {
        responseObj.status = status;
        responseObj.message = message;
        responseObj.details = [
          { message: errorMessage, details: { order_id: orderId } },
        ];
      }
      if (status == 1) {
        responseObj.status = status;
        responseObj.message = message;
        responseObj.details = [
          {
            details: {
              order_id: orderId,
              ns_itemfulfilment_id: errorMessage,
              sales_order_line_changed: errorName,
            },
          },
        ];
      }
      return responseObj;
    } catch (error) {
      log.errro("Error : In Return Response", error);
      return false;
    }
  }

  //function for ryder order reallocation
  function ryderOrderProcess(data, standardTime) {
    try {
      //get order by id
      var orderDetails = getOrderById(data.order_id);
      log.debug("orderDetails==" + orderDetails.length, orderDetails);
      if (orderDetails.length == 0) {
        return returnResponse(
          0,
          "fail",
          "SALES_ORDER_NOT_FOUND",
          "Missing Sales Order In NetSuite",
          data.order_id
        );
      }

      //get bulksalesorder by sales order id
      var bulkSO = getBulkSalesOrderBySalesOrder(orderDetails[0].id);
      log.debug("BulkSalesOrderBySalesOrder==" + bulkSO.length, bulkSO);

      var ifCreatedForRyder = createItemFulfilmentForRyderOrder(
        data,
        standardTime,
        orderDetails[0].id,
        bulkSO[0].bulk_id
      );
      /* //get bulksalesorder by sales order id
            var bulkSO = getBulkSalesOrderBySalesOrder(orderDetails[0].id);
            log.debug('BulkSalesOrderBySalesOrder=='+bulkSO.length,bulkSO); */
      //fail
      if (ifCreatedForRyder.error) {
        //update boso lines with error details
        updateErrorSoLinesRecordForRyderOrder(
          bulkSO[0].bulk_so_id,
          "installation",
          data.messageId,
          ifCreatedForRyder.message
        );
        return returnResponse(
          0,
          "fail",
          ifCreatedForRyder.error,
          ifCreatedForRyder.message,
          data.order_id
        );
      }

      //update boso lines with success
      updateSoLinesRecordForRyderOrder(
        bulkSO[0].bulk_so_id,
        "installation",
        data.installation_date,
        ifCreatedForRyder.ns_itemfulfilment_id,
        ifCreatedForRyder.if_quantity,
        data.messageId,
        standardTime
      );
      //success
      return returnResponse(
        1,
        "success",
        ifCreatedForRyder.ns_itemfulfilment_id,
        ifCreatedForRyder.sales_order_line_changed
      );
    } catch (error) {
      log.error("Error : In Ryder Order Prcess", error);
      return returnResponse(
        0,
        "fail",
        error.name,
        error.message,
        data.order_id
      );
    }
  }

  //function for get order by id
  function getOrderById(orderId) {
    try {
      var salesOrders = [];
      search
        .create({
          type: search.Type.TRANSACTION,
          filters: [
            {
              name: "type",
              operator: search.Operator.ANYOF,
              values: ["SalesOrd"],
            },
            {
              name: "mainline",
              operator: search.Operator.IS,
              values: true,
            },
            {
              name: "otherrefnum",
              operator: search.Operator.EQUALTO,
              values: [orderId],
            },
          ],
          columns: [{ name: "internalid" }, { name: "entity" }],
        })
        .run()
        .each((salesOrder) => {
          var order = {
            id: salesOrder.getValue({ name: "internalid" }),
            customer: salesOrder.getValue({ name: "entity" }),
          };
          salesOrders.push(order);
          return true;
        });
      return salesOrders;
    } catch (error) {
      log.error("Error : In Get Order By Id", error);
      return [];
    }
  }

  //function to create the item fulfilment for ryder order reallocation
  function createItemFulfilmentForRyderOrder(
    data,
    standardTime,
    salesOrderId,
    bulkRecId
  ) {
    try {
      //get the trainer sku form the script parameter
      var scriptObj = runtime.getCurrentScript();
      var trainerSkus = scriptObj.getParameter("custscript_trainer_skus");
      trainerSkus = trainerSkus.split(",");
      log.debug("trainerSkus==" + trainerSkus.length, trainerSkus);

      var payloadSkus = data.SKU_Details;
      log.debug("payloadSkus==" + payloadSkus.length, payloadSkus);

      var pItmeData = [],
        sku = "",
        payloadTrainerSku = [];
      for (var p in payloadSkus) {
        var pd = payloadSkus[p];
        pd.member_item = pd.SKU_Code;
        pItmeData.push(pd);
      }
      payloadSkus = pItmeData;
      // log.debug('payloadSkusAfter=='+payloadSkus.length,payloadSkus);

      //check payload skus details having which trainer sku(100-0001 or 100-0002);
      var indexT1 = payloadSkus.findIndex(function (obj) {
        return obj.member_item == trainerSkus[0]; //100-0001
      });

      var indexT2 = payloadSkus.findIndex(function (obj) {
        return obj.member_item == trainerSkus[1]; //100-0002
      });

      var indexT3 = payloadSkus.findIndex(function (obj) {
        return obj.member_item == trainerSkus[2]; //150-0016
      });

      if (indexT1 != -1) {
        sku = trainerSkus[0]; //100-0001
        payloadTrainerSku.push(payloadSkus[indexT1]);
      } else if (indexT2 != -1) {
        sku = trainerSkus[1]; //100-0002
        payloadTrainerSku.push(payloadSkus[indexT2]);
      } else if (indexT3 != -1) {
        sku = trainerSkus[2]; //150-0016
        payloadTrainerSku.push(payloadSkus[indexT3]);
      }

      log.debug(
        "payloadTrainerSku==" + payloadTrainerSku.length,
        payloadTrainerSku
      );

      //load sales order
      var soRec = record.load({
        type: "salesorder",
        id: salesOrderId,
      });

      let saleslocation = soRec.getValue("location");
      log.debug("saleslocation==", saleslocation);

      var soLineCount = soRec.getLineCount({ sublistId: "item" });
      var lineChanged = false;

      var salesOrderLocation = soRec.getValue({
        fieldId: "location",
      });

      var soLineCount = soRec.getLineCount({ sublistId: "item" });
      var lineChanged = false;

      var salesOrderLocation = soRec.getValue({
        fieldId: "location",
      });

      var itemSwapObjT1 = {
        50: 1696, //T00001-1 : T00001-1-3
        1410: 1695, //T00001-1-2 : T00001-1-4
        1332: 52, //T00001.2 - T800 : T00001.2
        1343: 53, //T00001.4 - T800 : T00001.4
      };
      var itemSwapObjT800 = {
        1696: 50,
        1695: 1410,
        52: 1332,
        53: 1343,
      };

      for (var i = 0; i < soLineCount; i++) {
        var cItem = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "item",
          line: i,
        });
        var curAmount = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "amount",
          line: i,
        });
        var curQuantity = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "quantity",
          line: i,
        });
        var curRate = soRec.getSublistValue({
          sublistId: "item",
          fieldId: "rate",
          line: i,
        });

        // log.debug({title:'CItem', details: cItem});
        if (
          [50, 52, 53, 1332, 1343, 1410, 1695, 1696].indexOf(parseInt(cItem)) >
          -1
        ) {
          var itemMembers = getItemMemberTrainerSku(cItem, true);
          log.debug("itemMembers==" + itemMembers.length, itemMembers);

          var trainerSkuMathces = getMatchedSkuNew(
            payloadTrainerSku,
            itemMembers
          );
          log.debug(
            "trainerSkuMathces==" + trainerSkuMathces.length,
            trainerSkuMathces
          );

          if (trainerSkuMathces.length == 0) {
            log.debug("sku==", sku);

            if (sku == trainerSkus[0]) {
              // log.debug({title:'SKU is 100-0001', details:sku});
              if (itemSwapObjT1.hasOwnProperty(cItem)) {
                // log.debug({title:'Swapping Item', details:'Swapping'});
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "item",
                  line: i,
                  value: itemSwapObjT1[cItem],
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "quantity",
                  line: i,
                  value: curQuantity,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "rate",
                  line: i,
                  value: curRate,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "amount",
                  line: i,
                  value: curAmount,
                });
                lineChanged = true;
              }
            } else if (sku == trainerSkus[1]) {
              // log.debug({title:'SKU is 100-0002', details:sku});
              if (itemSwapObjT800.hasOwnProperty(cItem)) {
                // log.debug({title:'Swapping Item', details:'Swapping'});
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "item",
                  line: i,
                  value: itemSwapObjT800[cItem],
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "quantity",
                  line: i,
                  value: curQuantity,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "rate",
                  line: i,
                  value: curRate,
                });
                soRec.setSublistValue({
                  sublistId: "item",
                  fieldId: "amount",
                  line: i,
                  value: curAmount,
                });
                lineChanged = true;
              }
            }
          }
        }
      }

      log.debug("SOLINECHANGED==", lineChanged);

      // Save SO only if line was changed
      if (lineChanged) {
        var soId = soRec.save({ ignoreMandatoryFields: true });
        if (soId) {
          log.debug("Sales Order Updated With Line Swapping", soId);
        }
      }

      //convert date from GMT/UTC to PST/PDT
      /* var PSTPSDDATE = gmtToPst(data.installation_date,standardTime);

            log.debug('PSTPSDDATE SET==',PSTPSDDATE); */
      var ESTDATE = convertGMTToEST(data.installation_date);
      log.debug("ESTDATE==", ESTDATE);
      ESTDATE = format.format({
        value: new Date(ESTDATE),
        type: format.Type.DATE,
      });

      log.debug("ESTDATE SET==", ESTDATE);

      var locationDetail = search.lookupFields({
        type: "customrecord_bulk",
        id: bulkRecId,
        columns: ["custrecord_bo_to_location"],
      }).custrecord_bo_to_location[0].value;

      //get location by externalid
      /* var locationDetail = getLocationByExternalId(data.DC_Code);
            log.debug('locationDetail==',locationDetail);
            if(locationDetail.error){
                return returnResponse(0,'fail','LOCATION_NOT_FOUND','Location is missing in NetSuite',data.order_id);
            } */

      //create if
      if (!saleslocation) {
        var ifObj = record.transform({
          fromType: record.Type.SALES_ORDER,
          fromId: salesOrderId,
          toType: record.Type.ITEM_FULFILLMENT,
          isDynamic: true,
        });

        //set trandate
        ifObj.setValue("trandate", new Date(ESTDATE) /* PSTPSDDATE */);

        //set sales order location
        ifObj.setValue({
          fieldId: "custbody_sales_order_location",
          value: salesOrderLocation,
        }); // Set Sales Order Location for Retail P&L GL Plugin

        //set memo
        ifObj.setValue({ fieldId: "memo", value: data.order_id });

        var ifLineCount = ifObj.getLineCount("item");
        log.debug("ifLineCount==", ifLineCount);
        for (var i = 0; i < ifLineCount; i++) {
          ifObj.selectLine({
            sublistId: "item",
            line: i,
          });

          var itemType = ifObj.getCurrentSublistValue("item", "itemtype", i);

          if (
            itemType != "Service" &&
            itemType != "OthCharge" &&
            itemType != "Subtotal" &&
            itemType != "Payment"
          ) {
            ifObj.setCurrentSublistValue(
              "item",
              "quantity",
              payloadTrainerSku[0].SKU_Qty
            );

            ifObj.setCurrentSublistValue(
              "item",
              "custcol_tonal_serial_number",
              data.serial_number
            );
          }

          //set receive true
          ifObj.setCurrentSublistValue("item", "itemreceive", true);

          //set location
          ifObj.setCurrentSublistValue("item", "location", locationDetail);

          ifObj.commitLine("item");
        }
      } else {
        log.debug("RUNNING WITH SO LOCATION IF CREATION");
        var ifObj = record.transform({
          fromType: record.Type.SALES_ORDER,
          fromId: salesOrderId,
          toType: record.Type.ITEM_FULFILLMENT,
          isDynamic: false,
        });

        //set trandate
        ifObj.setValue("trandate", new Date(ESTDATE) /* PSTPSDDATE */);

        //set sales order location
        ifObj.setValue({
          fieldId: "custbody_sales_order_location",
          value: salesOrderLocation,
        }); // Set Sales Order Location for Retail P&L GL Plugin

        //set memo
        ifObj.setValue({ fieldId: "memo", value: data.order_id });

        var ifLineCount = ifObj.getLineCount("item");
        log.debug("ifLineCount==", ifLineCount);
        for (var i = 0; i < ifLineCount; i++) {
          var itemType = ifObj.getSublistValue("item", "itemtype", i);

          //set location
          ifObj.setSublistValue("item", "location", i, locationDetail);

          if (
            itemType != "Service" &&
            itemType != "OthCharge" &&
            itemType != "Subtotal" &&
            itemType != "Payment"
          ) {
            ifObj.setSublistValue(
              "item",
              "quantity",
              i,
              payloadTrainerSku[0].SKU_Qty
            );

            ifObj.setSublistValue(
              "item",
              "custcol_tonal_serial_number",
              i,
              data.serial_number
            );
          }

          //set receive true
          ifObj.setSublistValue("item", "itemreceive", i, true);
        }
      }

      var newIfId = ifObj.save();
      if (newIfId) {
        log.debug("IF Created For SO#" + salesOrderId, "IF#" + newIfId);
        return {
          message: "success",
          ns_itemfulfilment_id: Number(newIfId),
          sales_order_line_changed: lineChanged,
          if_quantity: payloadTrainerSku[0].SKU_Qty,
        };
      }
    } catch (error) {
      log.error("Error : In Create IF For Ryder Order", error);
      var err = error.message;
      if (err.length > 290) {
        err = error.name;
      }
      return { error: error.name, message: err };
    }
  }

  //function to get the array of object by comparing 2 arary of object
  function getMatchedSkuNew(itemArray1, itemArray2) {
    try {
      var props = [
        "item_id",
        "member_item",
        "member_item_id",
        "SKU_Qty",
        "SKU_Name",
      ];

      var result = itemArray1
        .filter(function (o1) {
          return itemArray2.some(function (o2) {
            return o1.member_item === o2.member_item;
          });
        })
        .map(function (o) {
          return props.reduce(function (newo, name) {
            newo[name] = o[name];
            return newo;
          }, {});
        });
      return result;
    } catch (error) {
      log.error("Error : In Get Matched Sku New", error);
      return [];
    }
  }

  //function to get the Bulk Sales Order By Sales Order
  function getBulkSalesOrderBySalesOrder(soId) {
    try {
      var customrecord_bulk_sales_orderSearchObj = search.create({
        type: "customrecord_bulk_sales_order",
        filters: [
          ["isinactive", "is", "F"],
          "AND",
          ["custrecord_bo_so_sales_order", "anyof", soId],
        ],
        columns: [
          search.createColumn({
            name: "name",
            sort: search.Sort.ASC,
            label: "Name",
          }),
          search.createColumn({
            name: "custrecord_bo_so_sales_order",
            label: "Sales Order",
          }),
          search.createColumn({
            name: "custrecord_bo_so_customer_order_no",
            label: "Customer Order No",
          }),
          search.createColumn({
            name: "custrecord_bo_so_parent",
            label: "BO SO Parent",
          }),
        ],
      });
      var searchResultCount =
        customrecord_bulk_sales_orderSearchObj.runPaged().count;
      log.debug("Bulk Sales Order By Sales Order Count", searchResultCount);
      var data = [];
      customrecord_bulk_sales_orderSearchObj.run().each(function (result) {
        data.push({
          bulk_so_id: result.id,
          sales_order_id: result.getValue("custrecord_bo_so_sales_order"),
          bulk_id: result.getValue("custrecord_bo_so_parent"),
        });
        return true;
      });
      return data;
    } catch (error) {
      log.error("Error : In Get Bulk Sales Order By Sale Order", error);
      return [];
    }
  }

  //function to update the all so line with error for Ryder Order
  function updateErrorSoLinesRecordForRyderOrder(
    recId,
    type,
    messageId,
    errorDetail
  ) {
    try {
      var recObj = record.load({
        type: "customrecord_bulk_sales_order",
        id: recId,
        isDynamic: true,
      });

      var lineCount = recObj.getLineCount({
        sublistId: "recmachcustrecord_bo_so_line_parent",
      });
      log.debug("bulkSoLineCount==", lineCount);

      for (var l = 0; l < lineCount; l++) {
        recObj.selectLine({
          sublistId: "recmachcustrecord_bo_so_line_parent",
          line: l,
        });

        recObj.setCurrentSublistValue({
          sublistId: "recmachcustrecord_bo_so_line_parent",
          fieldId: "custrecord_bo_so_line_error_msg",
          value: JSON.stringify(errorDetail),
        });

        if (type == "installation" && messageId != "notupdate") {
          recObj.setCurrentSublistValue({
            sublistId: "recmachcustrecord_bo_so_line_parent",
            fieldId: "custrecord_bo_so_line_install_file_name",
            value: messageId,
          });

          recObj.setCurrentSublistValue({
            sublistId: "recmachcustrecord_bo_so_line_parent",
            fieldId: "custrecord_bo_so_line_installed_qty",
            value: "",
          });
        }

        recObj.commitLine({
          sublistId: "recmachcustrecord_bo_so_line_parent",
        });
      }
      var recid = recObj.save();
      if (recid) {
        log.debug("Record Updated With Error Details For Ryder Order", recid);
      }
    } catch (error) {
      log.error("Error : In Update Error So Lines For Ryder Order", error);
    }
  }

  //function to update the all so line grand childwith qty, IF,date for Ryder Order
  function updateSoLinesRecordForRyderOrder(
    recId,
    type,
    date,
    ifId,
    ifQuantity,
    messageId,
    standardTime
  ) {
    try {
      //convert date from GMT/UTC to PST/PDT
      /* var PSTPSDDATE = gmtToPst(date,standardTime);

            log.debug('PSTPSDDATE SET==',PSTPSDDATE); */
      var ESTDATE = convertGMTToEST(date);
      log.debug("ESTDATE==", ESTDATE);
      ESTDATE = format.format({
        value: new Date(ESTDATE),
        type: format.Type.DATE,
      });

      log.debug("ESTDATE SET==", ESTDATE);

      var recObj = record.load({
        type: "customrecord_bulk_sales_order",
        id: recId,
        isDynamic: true,
      });

      var lineCount = recObj.getLineCount({
        sublistId: "recmachcustrecord_bo_so_line_parent",
      });
      log.debug("bulkSoLineCount==", lineCount);

      for (var l = 0; l < lineCount; l++) {
        recObj.selectLine({
          sublistId: "recmachcustrecord_bo_so_line_parent",
          line: l,
        });

        if (type == "installation") {
          recObj.setCurrentSublistValue({
            sublistId: "recmachcustrecord_bo_so_line_parent",
            fieldId: "custrecord_bo_so_line_installed_qty",
            value: ifQuantity,
          });

          recObj.setCurrentSublistValue({
            sublistId: "recmachcustrecord_bo_so_line_parent",
            fieldId: "custrecord_bo_so_line_installation_date",
            value: new Date(ESTDATE) /* PSTPSDDATE */, //new Date(date)
          });

          if (ifId) {
            recObj.setCurrentSublistValue({
              sublistId: "recmachcustrecord_bo_so_line_parent",
              fieldId: "custrecord_bo_so_line_install_if",
              value: ifId,
            });
          }

          recObj.setCurrentSublistValue({
            sublistId: "recmachcustrecord_bo_so_line_parent",
            fieldId: "custrecord_bo_so_line_install_file_name",
            value: messageId,
          });
        }

        recObj.setCurrentSublistValue({
          sublistId: "recmachcustrecord_bo_so_line_parent",
          fieldId: "custrecord_bo_so_line_error_msg",
          value: "",
        });

        recObj.commitLine({
          sublistId: "recmachcustrecord_bo_so_line_parent",
        });
      }
      var Id = recObj.save();
      if (Id) {
        log.debug("So Lines Updated For Ryder Order==", Id);
        return Number(Id);
      }
    } catch (error) {
      log.error("Error : In Update SoLinesRecord For Ryder Order", error);
      return { error: error.name, message: error.message };
    }
  }

  //function to convert GMT to EST timezone
  function convertGMTToEST(date) {
    // Create a new Date object from the input date
    /*  var gmtDate = new Date(Date.UTC(date));
    
        // Convert the GMT date to EST using toLocaleString with the 'America/New_York' time zone
        var estDate = gmtDate.toLocaleString("en-US", { timeZone: "America/New_York" });
    
        return new Date(estDate); */

    /* if(standardTime){
            var offset = 420; //PST 7 hours behind the UTC/GMT in munutes(7*60=420)
        }
        else if(!standardTime){
            var offset = 480; //PDT 8 hours behind the UTC/GMT in munutes(8*60=480)
        } */
    var offset = 240;
    var offsetMillis = offset * 60 * 1000;
    var today = new Date(date);
    var millis = today.getTime();
    var timeZoneOffset = today.getTimezoneOffset() * 60 * 1000;

    var pst = millis - offsetMillis;
    var currentDate = new Date(pst);

    // log.debug("PST Time : " , currentDate.toUTCString());
    // log.debug("Local Time : " , new Date(today.getTime() - timeZoneOffset).toUTCString());

    return currentDate;
  }

  return {
    post: createITAndStampSOShipLineDates,
  };
});
