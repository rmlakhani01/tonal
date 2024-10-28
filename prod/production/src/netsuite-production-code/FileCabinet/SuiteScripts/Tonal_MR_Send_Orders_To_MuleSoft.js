/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Send Orders To MuleSoft
 * File Name   : Tonal_MR_Send_Orders_To_MuleSoft.js
 * Description : This script is used for send fulfill order data to MuleSoft
 * Created On  : 15/03/2024
 * Modification Details:
 * ************************************************************/
let record, search, https, runtime;
define(["N/record", "N/search", "N/https", "N/runtime"], main);
function main(recordModule, searchModule, httpsModule, runtimeModule) {
  try {
    record = recordModule;
    search = searchModule;
    https = httpsModule;
    runtime = runtimeModule;
    return {
      getInputData: getInputData,
      map: map,
      reduce: reduce,
      summarize: summarize,
    };
  } catch (error) {
    log.error("Main Exception", error);
  }
}

const getInputData = () => {
  try {
    let scriptObj = runtime.getCurrentScript();
    let deploymentId = scriptObj.deploymentId;
    log.debug("deploymentId==", deploymentId);
    let ssId, configurationRec;
    ssId = scriptObj.getParameter("custscript_order_data");
    configurationRec = scriptObj.getParameter("custscript_configuration_data");
    if (!ssId || !configurationRec) {
      log.debug("NO_ACTION", "PARAMETER_MISSING");
      return [];
    }

    log.debug("ssId==" + ssId, "configurationRec==" + configurationRec);
    return search.load({
      id: ssId,
    });
  } catch (error) {
    log.error("Error : In Get Input", error);
    return [];
  }
};

const map = (context) => {
  try {
    let ssdata = JSON.parse(context.value);
    let salesOrderId = context.key;
    //load the sales order and form the payload , to send the MuleSoft

    let soObj = record.load({
      type: "salesorder",
      id: salesOrderId,
      isDynamic: true,
    });

    //get all the information that needs for the payload
    let tarnId = soObj.getValue("tranid");
    let nsCustomerId = soObj.getValue("entity");
    let customerObj = search.lookupFields({
      type: search.Type.CUSTOMER,
      id: nsCustomerId,
      columns: [
        "entityid",
        "isperson",
        "firstname",
        "middlename",
        "lastname",
        "companyname",
        "email",
        "phone",
        "datecreated",
        "externalid",
      ],
    });

    log.debug("customerObj==", customerObj);

    let isIndividual = customerObj.isperson;
    log.debug("isIndividual==", isIndividual);
    if (isIndividual == true) {
      let customername =
        customerObj.firstname +
        " " +
        customerObj.midname +
        " " +
        customerObj.lastname;
    } else {
      let customername = customerObj.companyname;
    }

    let customerType = soObj.getText("custbody_customer_type");
    let customerCategory = soObj.getText("custbody_customer_category");
    log.debug(
      "customerType==" + customerType,
      "customerCategory==" + customerCategory
    );

    let tranDate = soObj.getValue("trandate");
    let wocommerceOrderid = soObj.getValue("otherrefnum");
    let salesEffectiveDate = soObj.getValue("saleseffectivedate");

    let subsidiaryId = soObj.getValue("subsidiary");
    let subsidiaryObj = search.lookupFields({
      type: search.Type.SUBSIDIARY,
      id: subsidiaryId,
      columns: ["namenohierarchy"],
    });
    let subSidiaryName = subsidiaryObj.namenohierarchy;

    let locationId = soObj.getValue("location");
    if (locationId) {
      let locationObj = search.lookupFields({
        type: search.Type.LOCATION,
        id: locationId,
        columns: ["namenohierarchy"],
      });
      locationName = locationObj.namenohierarchy;
    }

    let departrmentId = soObj.getValue("department");
    let departmemntName = "";
    if (departrmentId) {
      let departmentObj = search.lookupFields({
        type: search.Type.DEPARTMENT,
        id: departrmentId,
        columns: ["namenohierarchy"],
      });
      departmemntName = departmentObj.namenohierarchy;
    }

    let orderType = soObj.getValue("custbody_jaz_ordertype") || "";
    let orderTypeName = soObj.getText("custbody_jaz_ordertype") || "";

    let createdDate = soObj.getValue("createddate");

    let lastModifiedDate = soObj.getValue("lastmodifieddate");

    let orderStatus = soObj.getValue("statusRef");

    let shipDate = soObj.getText("shipdate");
    if (shipDate) {
      shipDate = convertDateInMSFormat(shipDate);
    }

    let currency = soObj.getValue("currencyname");

    let shipComplete = soObj.getValue("shipcomplete");

    let mulesoftError = soObj.getValue("custbody_tnl_ms_error_details");

    let soLines = soObj.getLineCount({
      sublistId: "item",
    });

    let itemObj = [];
    for (let l = 0; l < soLines; l++) {
      let itemId = soObj.getSublistValue({
        sublistId: "item",
        fieldId: "item",
        line: l,
      });

      let itemName = soObj.getSublistText({
        sublistId: "item",
        fieldId: "item",
        line: l,
      });

      let itemQty = soObj.getSublistValue({
        sublistId: "item",
        fieldId: "quantity",
        line: l,
      });

      let itemRate = soObj.getSublistValue({
        sublistId: "item",
        fieldId: "rate",
        line: l,
      });

      let itemAmount = soObj.getSublistValue({
        sublistId: "item",
        fieldId: "amount",
        line: l,
      });

      let itemLine = soObj.getSublistValue({
        sublistId: "item",
        fieldId: "line",
        line: l,
      });

      let itemSku = search.lookupFields({
        type: "item",
        id: itemId,
        columns: ["itemid"],
      }).itemid;

      let costEstimate = soObj.getSublistValue({
        sublistId: "item",
        fieldId: "costestimate",
        line: l,
      });

      itemObj.push({
        line: Number(itemLine),
        price: itemRate || 0,
        costEstimate: costEstimate,
        number: itemSku,
        name: itemName,
        quantity: itemQty,
        serialNumbers: "",
      });
    }

    let shipAddressSubRecord = soObj.getSubrecord({
      fieldId: "shippingaddress",
    });

    let s_lable = shipAddressSubRecord.getValue("label");
    let s_country = shipAddressSubRecord.getValue("country");
    let s_attention = shipAddressSubRecord.getValue("attention");
    let s_addresse = shipAddressSubRecord.getValue("addressee");
    let s_phone = shipAddressSubRecord.getValue("addrphone");
    let s_addr1 = shipAddressSubRecord.getValue("addr1");
    let s_addr2 = shipAddressSubRecord.getValue("addr2");
    let s_city = shipAddressSubRecord.getValue("city");
    let s_state = shipAddressSubRecord.getValue("state");
    let s_zip = shipAddressSubRecord.getValue("zip");

    let billingAddressSubRecor = soObj.getSubrecord({
      fieldId: "billingaddress",
    });

    let b_lable = billingAddressSubRecor.getValue("label");
    let b_country = billingAddressSubRecor.getValue("country");
    let b_attention = billingAddressSubRecor.getValue("attention");
    let b_addresse = billingAddressSubRecor.getValue("addressee");
    let b_phone = billingAddressSubRecor.getValue("addrphone");
    let b_addr1 = billingAddressSubRecor.getValue("addr1");
    let b_addr2 = billingAddressSubRecor.getValue("addr2");
    let b_city = billingAddressSubRecor.getValue("city");
    let b_state = billingAddressSubRecor.getValue("state");
    let b_zip = billingAddressSubRecor.getValue("zip");

    let orderSource = soObj.getValue("source");
    let parentCustomer = ssdata.values["altname.CUSTBODY_PARENT_CUSTOMER"];
    let muleErrorDetails = soObj.getValue("custbody_tnl_ms_error_details");
    let salesforceOrderId = soObj.getValue("custbody_tnl_sf_orderid");
    let externalid = soObj.getValue("externalid");
    let exportToMulesoft = soObj.getValue("custbody_tnl_so_export_to_mulesoft");
    let extendServiceOrderId = soObj.getValue(
      "custbody_extended_service_order_id"
    );
    let extendMethod = soObj.getValue("custbody_extended_method");
    let extendLeadToken = soObj.getValue("custbody_extend_lead_token");
    let extendErrored = soObj.getValue("custbody_extend_errored");
    let extendContractId = soObj.getValue("custbody_extended_contract_id");
    let extendLeadConversionCompleted = soObj.getValue(
      "custbody_lead_conversion_completed"
    );

    let payloadObj = {
      salesOrderTransactionId: tarnId,
      parentCustomer: parentCustomer,
      otherRefNum: wocommerceOrderid,
      externalId: externalid,
      createdDate: createdDate,
      lastModifiedDate: lastModifiedDate,
      salesEffectiveDate: salesEffectiveDate,
      orderStatus: orderStatus,
      actualShipDate: shipDate,
      currency: currency,
      orderSource: orderSource,
      muleErrorDetails: muleErrorDetails,
      salesforceOrderId: salesforceOrderId,
      exportToMulesoft: exportToMulesoft,
      customerType: customerType,
      customerCategory: customerCategory,
      extendServiceOrderId: extendServiceOrderId,
      extendMethod: extendMethod,
      extendLeadToken: extendLeadToken,
      extendErrored: extendErrored,
      extendContractId: extendContractId,
      extendLeadConversionCompleted: extendLeadConversionCompleted,
      customer: {
        firstName: customerObj.firstname,
        lastName: customerObj.lastname,
        dateCreated: customerObj.datecreated,
        email: customerObj.email,
        externalId: customerObj.externalid[0].value,
        id: nsCustomerId,
        phone: customerObj.phone,
      },
      billingAddress: {
        name: customerObj.firstname + " " + customerObj.lastname,
        addr1: b_addr1,
        addr2: b_addr2,
        city: b_city,
        state: b_state,
        country: b_country,
        zip: b_zip,
        attention: b_attention,
        phone: b_phone,
      },
      shippingAddress: {
        name: customerObj.firstname + " " + customerObj.lastname,
        addr1: s_addr1,
        addr2: s_addr2,
        city: s_city,
        state: s_state,
        country: s_country,
        zip: s_zip,
        attention: s_attention,
        phone: s_phone,
      },
      subsidiary: {
        id: subsidiaryId,
        refName: subSidiaryName,
      },

      items: itemObj,
    };

    log.debug("payloadObj==", JSON.stringify(payloadObj));

    context.write({
      key: salesOrderId,
      value: { status: true, payload: payloadObj },
    });
  } catch (error) {
    log.error("Error : In Map Stage", error);
    context.write({
      key: salesOrderId,
      value: { status: false, error: error.message, payload: "" },
    });
  }
};

const reduce = (context) => {
  try {
    let data = JSON.parse(context.values[0]);
    let recId = JSON.parse(context.key);
    context.write({ key: recId, value: data });
  } catch (error) {
    log.error("Error : In Reduce Stage", error);
    context.write({
      key: recId,
      value: { status: false, error: error.message, payload: "" },
    });
  }
};

const summarize = (summary) => {
  try {
    let scriptObj = runtime.getCurrentScript();
    let deploymentId = scriptObj.deploymentId;
    log.debug("deploymentId==", deploymentId);
    let configurationRec;
    configurationRec = scriptObj.getParameter("custscript_configuration_data");

    configurationRec = scriptObj.getParameter("custscript_configuration_data");

    log.debug("configurationRec==", configurationRec);
    const soIds = [],
      payloadData = [];
    summary.output.iterator().each(function (key, value) {
      /* log.debug({
                title: 'Order Details',
                details: 'key: ' + key + ' / value: ' + value
            }); */

      const data = JSON.parse(value);

      if (data.status == true) {
        soIds.push(key);
        payloadData.push(data.payload);
      }
      return true;
    });

    log.debug("soIds==" + soIds.length, soIds);
    if (soIds.length > 0) {
      let globalConfiguration = getGlobalConfiguration(configurationRec);
      if (globalConfiguration.length == 0) {
        log.debug("NOT_SYNC_TO_MULESOFT", "GLOBAL_CONFIG_MISSING");
        return;
      }

      log.debug("payloadData==" + payloadData.length, payloadData[0]);
      if (payloadData.length > 0) {
        //make 10 count of payload for one api call
        let chunkData = makeArrayDataChunks(payloadData);
        log.debug("chunkDatacount==", chunkData.length);
        if (chunkData.length > 0) {
          for (var ci in chunkData) {
            try {
              syncSalesOrderToMuleSoft(chunkData[ci], globalConfiguration);
            } catch (error) {
              log.debug("Error : While Syncing Data To MS ", error);
            }
          }
        }
      }
    }
  } catch (error) {
    log.error("Error : In Summarize Stage", error);
  }
};

//function to get the global configuration details
const getGlobalConfiguration = (recId) => {
  try {
    let customrecord_tnl_global_configurationSearchObj = search.create({
      type: "customrecord_integration_configuration",
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
          name: "custrecord_tnl_ms_user_name",
          label: "MuleSoft User Name",
        }),
        search.createColumn({
          name: "custrecord_tnl_ms_password",
          label: "MuleSoft Password",
        }),
        search.createColumn({
          name: "custrecord_tnl_ms_ms_auth_token",
          label: "MuleSoft Auth Token",
        }),
        search.createColumn({
          name: "custrecord_tnl_ms_api_url",
          label: "MULESOFT FULFILL ORDER API URL",
        }),
      ],
    });
    let searchResultCount =
      customrecord_tnl_global_configurationSearchObj.runPaged().count;
    log.debug("GlobalConfiguration Count", searchResultCount);
    let configurationDetails = [];
    customrecord_tnl_global_configurationSearchObj
      .run()
      .each(function (result) {
        configurationDetails.push({
          gc_rec_id: result.id,
          app_name: result.getValue("name"),
          app_user_name: result.getValue("custrecord_tnl_ms_user_name"),
          app_password: result.getValue("custrecord_tnl_ms_password"),
          app_auth_token: result.getValue("custrecord_tnl_ms_ms_auth_token"),
          app_orderfulfill_api_url: result.getValue(
            "custrecord_tnl_ms_api_url"
          ),
        });
        return true;
      });
    return configurationDetails;
  } catch (error) {
    log.error("Error : In Get Global Configuaration", error);
    return [];
  }
};

//function to sync the data to MuleSoft
const syncSalesOrderToMuleSoft = (payloadObj, globalConfiguration) => {
  try {
    log.debug("POST OPERATION", "RUNNING");
    let request = https.post({
      body: JSON.stringify(payloadObj),
      url: globalConfiguration[0].app_orderfulfill_api_url,
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        Authorization: "Basic " + globalConfiguration[0].app_auth_token,
      },
    });

    let responseCode = request.code;
    let responseBody = request.body;

    log.debug("responseCode==" + responseCode, "responseBody==" + responseBody);

    if (responseCode == 200) {
      log.debug("ORDERS_PUSHED_IN_MULESOFT", "SUCCESSFULLY");
    } else {
      log.debug("ORDERS_PUSHED_IN_MULESOFT", "UNSUCCESSFULLY");
    }
  } catch (error) {
    log.error("Error : In Sync SO Data In MuleSoft", error);
  }
};

//function to make chunks of array
const makeArrayDataChunks = (dataArray) => {
  try {
    let perChunk = 10; // items per chunk(IN SB 10,FOR PROD 10)

    let inputArray = dataArray; //;['a','b','c','d','e']

    let result = inputArray.reduce(function (resultArray, item, index) {
      let chunkIndex = Math.floor(index / perChunk);

      if (!resultArray[chunkIndex]) {
        resultArray[chunkIndex] = []; // start a new chunk
      }

      resultArray[chunkIndex].push(item);

      return resultArray;
    }, []);

    // log.debug('chunkresult==',result); // result: [['a','b'], ['c','d'], ['e']]
    return result;
  } catch (error) {
    log.error("Error : In Make Array Data Chunks", error);
    return [];
  }
};

//function to convert date in MS format
const convertDateInMSFormat = (date) => {
  let dd = date.split("/");
  let y = dd[2];
  let m = dd[0];
  let d = dd[1];
  return y + "-" + m + "-" + d;
};
