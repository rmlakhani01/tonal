/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event
 * Script Name : Tonal_UE_Add Warranty_To_SO.js
 * File Name   : Tonal_UE_Add Warranty_To_SO.js
 * Description : Script used to Create Warranty records against each item in SO
 * Created On  : 08/28/2023 
 * Modification Details:  
 ************************************************************/
/**
 * Script Modification Log:
 * 
    Version 	Env		-- Date -- 		Owner		Requested By		Description --
    0.0			SB		08/28/2023		Asha		Vinu				Script used to Create Warranty records against each item in SO
	V2			SB		07/28/2023		Asha		Vinu				Added code to set TOS Version
	V3			SB		08/31/2023		Asha		Vinu				Added code to duplicate Warranty records, if extended warranty record is there in SO
	V4			SB		09/08/2023		Vikash		Joanna				Modification for the if Order Type (field custbody_jaz_ordertype) is 'In Warranty Claim Order' no warranty records to create.
																		And If Order Type is 'Out of Warranty Order' and if we see line item '150-0016'(the replace Trainer) or Repair (the exact repair sku is still to be determined), set warranty type as 'Limited'
	V5			SB		09/12/2023		Vikash		Joanna				Update entire algorithm based on discussion, removed so search get details form cusrrent record objects
	V6			SB		09/13/2023		Vikash							Updated script for the Inventory item is on SO having "warranty eligible" true then warranty record needs to create
	V7    		SB		09/14/2023		Vikash		Joanna				Modification for the SO with order Type 'External' and Order item is 150-0016 B Stock Trainer the warranty type is Standard
	V8			SB 		15/14/2023		Vikash							Modifcation for the search was not giving the correct outpu for the "GetItemDetails" method
	V9			SB		09/26/2023		Vikash		Joanna				Modification for the Inventory item also came in place for the warrnty eligible needs to create warranty records
	V10			SB		09/10/2023		Vikash		Joanna				Modification for the trigger point intially it was running on SO creation now needs to run on IF creation, because SO line item often gets changed line item while making IF
	V11			Sb		13/10/2023		Vikash		Joanna				Modification as per the jira ticket [ES-3036]
	V12			SB		16/10/2023		Vikash		Joanna				Modification as per the jira ticket [ES-3036]
	V13			SB		23/10/2023		Vikash		Joanna				Modification for the recursive function, it was not executing properly
	V14         SB      23/10/2023      Vikash      Joanna              Modifcation as per the jira ticket [ES-3062]
	V15			Sb		24/10/2023		Vikash		Joanna				Modification for the multiple line item on SO having wrong "item" as a parent item was happening so update the logic as required
	V16			SB		27/11/2023		Vikash		Joanna				Modification for the BBY order as per ther jira ticket [ES-3164]
	V17			SB		15/12/2023		Vikash		Prod issue			Modification for the "itemfulfillment" text was wrong in the condition for record type, so it was giving error for the load record
 */
define(
	[
		'N/record', 
		'N/search', 
		'N/runtime'
	],function(record, search, runtime) {		
	
	//Global Constants
	let dataItems = [],dataInventory = [];//these variabels will store data for the warranty items
	/**********************************************
	Event Type: After Submit
	Description: Script used to Create Warranty records against each item in SO
	******************************************************/ 
	const AfterSubmitSO = (scriptContext) => {
		try{
			log.debug("SO After Submit event", "STARTS");
			let eventType = scriptContext.type;
			log.debug('eventType', eventType);
			
			if(eventType != "create")
				return;
		
			//Get New and Old Record object
			let newRecordIF = scriptContext.newRecord;
			let recordType = newRecordIF.type;
			let recordIdIF = newRecordIF.id;
			log.debug('recordType - recordId', recordType +" - " + recordIdIF);
			
			if(recordIdIF){

				let recordId,newRecord;

				if(recordType == 'itemfulfillment'){

					//get the created form field value , if it is created from SO then only proceed for the warranty creation
					let createdFrom = newRecordIF.getValue('createdfrom');
					if(!createdFrom){
						return;
					}
					
					let createdFromText = newRecordIF.getText('createdfrom');
					createdFromText = createdFromText.split('#')[0].trim();
					log.debug('createdFromText=='+createdFromText,'createdFrom=='+createdFrom);

					if(createdFromText != 'Sales Order'){
						return;
					}

					recordId = createdFrom;

				}

				else if(recordType == 'salesorder'){
					recordId = recordIdIF;
				}

				//load the sales order and perform rest of the opertaions.
				newRecord = record.load({
					type: record.Type.SALES_ORDER,
					id: recordId,
					isDynamic: true
				});

				let scriptObj = runtime.getCurrentScript();
				let repairedItem = scriptObj.getParameter('custscript_repaired_items');
				let replacedItem = scriptObj.getParameter('custscript_replaced_items');
				log.debug('repairedItem=='+repairedItem,'replacedItem=='+replacedItem);

				//validate for the order type is "In Warranty Claim Order - 4" or "Out of Warranty Order - 5"
				let orderType = newRecord.getValue('custbody_jaz_ordertype');
				let orderTypeText = newRecord.getValue('custbody_jaz_ordertype');
				log.debug('orderType==',orderTypeText);

				let salesOrderStatus = newRecord.getValue('status');
				log.debug('salesOrderStatus==',salesOrderStatus);

				//check the so status and order type for BBY orders
				if(recordType=='salesorder'){
					if(!(orderType == 6 && salesOrderStatus == 'Closed')){
						log.debug('NO_ACTION','NOT_BBY_SALES_ORDER');
						return;
					}
				}
				
				//get the item detail which contains "150-0016" and order status is not "in warranty claim order"(4) then create warranty object/record
				let replacedSkuLine = newRecord.findSublistLineWithValue({
					sublistId: 'item',
					fieldId: 'item',
					value: replacedItem
				});
				log.debug('replacedSkuLine==',replacedSkuLine);

				if(orderType == 4 && replacedSkuLine > -1){
					log.debug('NO_ACTION','IN_WARRANTY_CLAIM_ORDER_WITH_150_0016_ITEM');
					return;
				}

				if(orderType == 4){
					log.debug('NO_ACTION','IN_WARRANTY_CLAIM_ORDER');
					return;
				}

				//validate order contains replaced/repaired items line
				let replacedItemAvilable = false, repairedItemAvilable = false;
				let soLineCount = newRecord.getLineCount('item');
				for(let s = 0 ; s < soLineCount ; s++){
					let itemId = newRecord.getSublistValue('item','item',s);
					if(itemId == repairedItem){
						repairedItemAvilable = true;
						break;
					}
					else if(itemId == replacedItem){
						replacedItemAvilable = true;
						break;
					}
				}

				log.debug('replacedItemAvilable=='+replacedItemAvilable,'repairedItemAvilable=='+repairedItemAvilable);
				
				let defaultWarrantyItems = runtime.getCurrentScript().getParameter({name: 'custscript_ext_warranty_items'});
				log.debug('defaultWarrantyItems', defaultWarrantyItems);
				
				//push warranty item in list
				let arrWarrantyItems = [];
				if(defaultWarrantyItems.indexOf(",") > -1){
					arrWarrantyItems = defaultWarrantyItems.split(",");
				}else{
					arrWarrantyItems.push(defaultWarrantyItems);
				}
				log.debug("arrWarrantyItems", arrWarrantyItems);
				
				let isExtWarrantyExists = false;

				//check for the warranty item avilable on so line 
				if(arrWarrantyItems.length > 0){
					for(let index = 0; index < arrWarrantyItems.length; ++index){
						
						let lineNumber = newRecord.findSublistLineWithValue({
							sublistId: 'item',
							fieldId: 'item',
							value: arrWarrantyItems[index]
						});
						if(lineNumber > -1){
							isExtWarrantyExists = true;
							break;
						}
					}
				}
				log.debug("isExtWarrantyExists", isExtWarrantyExists);
				
				let arrItemList = [];
				let arrmemberItems = [];
				let itemIds = [];
				//loop over the line and get the sku details for the warranty creation
				//needs to check item is not replace,repaired and itemtype none of 'Service', 'OthCharge', 'Subtotal', 'Payment'
				for(let s = 0 ; s < soLineCount ; s++){
					let itemId = newRecord.getSublistValue('item','item',s);
					let itemType = newRecord.getSublistValue('item','itemtype',s);
					if((itemId != repairedItem && itemId != replacedItem) && (itemType != 'Service' && itemType != 'OthCharge' && itemType != 'Subtotal' && itemType != 'Payment' && itemType != 'InvtPart')){
						let type = '';
						if(itemType == 'Kit'){
							type = record.Type.KIT_ITEM;
						}
						if(itemType == 'Assembly'){
							type = record.Type.ASSEMBLY_ITEM;
						}
						
						let itemComponets = getItemComponents(itemId,'',false);
						log.debug('itemComponets==',itemComponets);
						arrItemList = arrItemList.concat(itemComponets);
						itemIds.push(itemId);
					}
					else if(itemId == repairedItem || itemId == replacedItem){
						let itemObj = search.lookupFields({
							type: search.Type.ITEM,
							id: itemId,
							columns: ['custitem_warranty_eligible']
						});
						log.debug('itemObj==',itemObj);
						if(itemObj.custitem_warranty_eligible == true){
							arrItemList.push({item: itemId,member: "",filter: false,item_type:'Replace/Repaired'});
							itemIds.push(itemId);
						}
					}
					else if((itemId != repairedItem || itemId != replacedItem) && itemType == 'InvtPart'){
						let itemObj = search.lookupFields({
							type: search.Type.ITEM,
							id: itemId,
							columns: ['custitem_warranty_eligible']
						});
						log.debug('itemObjINVTPART==',itemObj);
						if(itemObj.custitem_warranty_eligible == true){
							arrItemList.push({item: itemId,member: "",filter: false,item_type:'InvtPart'});
							itemIds.push(itemId);
						}
					}
				}
				log.debug("arrItemList", JSON.stringify(arrItemList));
				log.debug('itemIds=='+itemIds.length,itemIds);
				
				//check for member's, member's... and so on for warranty eligible
				if(arrItemList.length > 0){

					let inventoryItems = arrItemList.filter(function(obj){
						return obj.item_type == 'InvtPart';
					});
					log.debug('inventoryItems=='+inventoryItems.length,inventoryItems);

					//check ofr replace/repaired then do nothing pass as it is
					let replacedOrRepaired = arrItemList.filter(function(obj){
						return obj.item_type == 'Replace/Repaired';
					});
					log.debug('replacedOrRepaired=='+replacedOrRepaired.length,replacedOrRepaired);

					//check each member items are eligible for warranty type 
					//along with check if member item is of type kit/assembly then there member are also eligible for warranty or not
					//first filter the data by type assembly or kit
					let assemblyOrKitItemData = arrItemList.filter(function(obj){
						return (obj.item_type == 'Assembly' || obj.item_type == 'Kit')
					});
					log.debug('assemblyOrKitItemData=='+assemblyOrKitItemData.length,assemblyOrKitItemData);

					if(assemblyOrKitItemData.length > 0){
						//filter the replaced sku(150-0016) for this item components are not eligible for warranty but this sku needs to come in warranty creation
						let replacedSku = arrItemList.filter(function(obj){
							return (obj.member == replacedItem);
						});
						log.debug('replacedSku=='+replacedSku.length,replacedSku);
						let assemblyMemberDetails = getItemDetails(assemblyOrKitItemData);
						log.debug('dataInventory=='+dataInventory.length,dataInventory);
						inventoryItems = inventoryItems.concat(dataInventory);
						arrItemList = []; //refresh the array
						arrItemList = arrItemList.concat(inventoryItems).concat(replacedSku);
					}
					else if(replacedOrRepaired.length > 0){
						arrItemList = arrItemList;
					}
					else if(inventoryItems.length > 0){
						arrItemList = arrItemList
					}
					
					// arrItemList = GetItemDetails(arrmemberItems, arrItemList);//member item,itemm and there member item
					log.debug("final arrItemList", JSON.stringify(arrItemList));
				}

				if(arrItemList.length > 0){

					//check for the legecy or regular TOS						
					let defaultDate = runtime.getCurrentScript().getParameter({name: 'custscript_default_date'});
					let dafaultDateFormat = new Date(defaultDate).getTime();
					log.debug("defaultDate - dafaultDateFormat", defaultDate + " - " + dafaultDateFormat);
					let tranDate = new Date(newRecord.getValue('trandate')).getTime();
					log.debug("tranDate", tranDate);
					let tosVersion = "",tosVersionText;
					if(tranDate < dafaultDateFormat){
						tosVersion = 1;//legacy
						tosVersionText = 'Legacy';
					}
					else if(tranDate > dafaultDateFormat){
						tosVersion = 2;//regular
						tosVersionText = 'Regular';
					}
					log.debug("tosVersion=="+tosVersion,'tosVersionText=='+tosVersionText);
					
					let warrantyRecIds = [];
					//Create Warranty record
					for(let index = 0; index < arrItemList.length; ++index){
						
						//Check component quantities
                        let quantity = arrItemList[index].memberquantity || 1;

						//If Extended Warranty Item exists
						if(isExtWarrantyExists){
							
							let warrantyType = '';
							if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 5){
								warrantyType = 3//limited
							}
							else if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 3){
								warrantyType = 1//standard
							}
							else{
								warrantyType = 1;//standard
							}
							//create standard warranty record
							let wRecCreated = createWarrantyRecord(recordId,arrItemList[index].item,warrantyType,arrItemList[index].member,tosVersion,quantity);
							if(wRecCreated.length > 0){
								for(let wr in wRecCreated){
                                    warrantyRecIds.push(wRecCreated[wr]);
                                }
							}

							if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 5){
								warrantyType = 3//limited
							}
							else if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 3){
								warrantyType = 1//standard
							}
							else{
								warrantyType = 2;//extended
							}
							//create extended warranty record
							let wRecCreated1 = createWarrantyRecord(recordId,arrItemList[index].item,warrantyType,arrItemList[index].member,tosVersion,quantity);
							if(wRecCreated1.length > 0){
								for(let wr1 in wRecCreated1){
                                    warrantyRecIds.push(wRecCreated1[wr1]);
                                }
							}

						}else{
						
							let warrantyType = '';
							if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 5){
								warrantyType = 3;//limited
							}
							else if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 3){
								warrantyType = 1//standard
							}
							else{
								warrantyType = 1;//standard
							}

							let wRecCreated2 = createWarrantyRecord(recordId,arrItemList[index].item,warrantyType,arrItemList[index].member,tosVersion,quantity);
							if(wRecCreated2.length > 0){
								for(let wr2 in wRecCreated2){
                                    warrantyRecIds.push(wRecCreated2[wr2]);
                                }
							}
						}
					}
					log.debug('warrantyRecIds=='+warrantyRecIds.length,warrantyRecIds);
				}
			}
			log.debug("Script Ends Here", "Warranty Record created");
		}
		catch(ex){
			log.error("Error creating Warranty recordagainst SO", ex.message);
		}
	}

	//function to create the warranty record
	const createWarrantyRecord = (soId,origianlItemId,warrantyType,warrantyItem,tos,quantity) =>{
		try {
			//create # of warranty record based on component's quantity
            let wRecCreated = [];
			for(let i = 0 ; i < quantity ; i++){
				const objWarrantyRec = record.create({
					type: "customrecord_warranty",
				});
				objWarrantyRec.setValue("custrecord_warranty_sales_order", soId);
				objWarrantyRec.setValue("custrecord_warranty_status", 1);
				objWarrantyRec.setValue("custrecord_original_order_line_item", origianlItemId);
				objWarrantyRec.setValue("custrecord_warranty_type", warrantyType);								
				if(warrantyItem)
					objWarrantyRec.setValue("custrecord_warranty_item",warrantyItem);
				else
					objWarrantyRec.setValue("custrecord_warranty_item",origianlItemId);
				if(tos)
					objWarrantyRec.setValue("custrecord_tos_version", tos);
				objWarrantyRec.setValue("custrecord_synced_salesforce", false);
				let newWarrantyRecId = objWarrantyRec.save({
					enableSourcing: true,
					ignoreMandatoryFields: true
				});
				if(newWarrantyRecId	){
					// log.debug("newWarrantyRecId", newWarrantyRecId);
					wRecCreated.push(newWarrantyRecId);
				}
			}
			return wRecCreated;
		} catch (error) {
			log.error('Error : In Create Warranty Record',error);
			return [];
		}
	}

	//function to get the item components
	const getItemComponents = (itemId,mainItem,recursiveCall) => {
		try {
			const itemSearchObj = search.create({
				type: "item",
				filters:
				[
				   ["internalid","anyof",itemId], 
				   "AND", 
				   ["isinactive","is","F"],
				   "AND",
				   ["memberitem.custitem_warranty_eligible","is","T"]
				],
				columns:
				[
				   search.createColumn({
					  name: "itemid",
					  sort: search.Sort.ASC,
					  label: "Name"
				   }),
				   search.createColumn({name: "displayname", label: "Display Name"}),
				   search.createColumn({name: "salesdescription", label: "Description"}),
				   search.createColumn({
						name: "type",
						join: "memberItem",
						label: "Type"
				   }),
				   search.createColumn({name: "memberitem", label: "Member Item"}),
				   search.createColumn({ name: "memberquantity", label: "Mamber Quantity"})
				]
			});
			let searchResultCount = itemSearchObj.runPaged().count;
			log.debug("Item Components Count For=="+itemId,searchResultCount);
			let data = []
			itemSearchObj.run().each(function(result){
				let main_item = '';
				if(recursiveCall == true){
					main_item = mainItem;
				}
				else{
					main_item = result.id;
				}
				data.push({"item": main_item, "member": result.getValue('memberitem'), "filter": false,"item_type":result.getValue({name: "type",join: "memberItem"}),"memberquantity": result.getValue('memberquantity')});
				return true;
			});
			return data;
		} catch (error) {
			log.error('Error : In Get Item Components',error);
			return [];
		}
	}

	//function to get the components member details(recursive call)
	const getItemDetails = (itemsData) => {
		try {
			for(let d in itemsData){
				let data = getItemComponents(itemsData[d].member,itemsData[d].item,true);
				let filterAssembly = data.filter(function(obj){
					return (obj.item_type == 'Assembly' || obj.item_type == 'Kit');
				});
				// log.debug('filterAssembly==OfRecursive=='+filterAssembly.length,filterAssembly);

				let filterInventory = data.filter(function(obj){
					return (obj.item_type == 'InvtPart');
				});

				// log.debug('filterInventory=OfRecursicve=='+filterInventory.length,filterInventory);

				dataInventory = dataInventory.concat(filterInventory);

				/* if(filterAssembly.length == 0){//Due to this the function was return when Item doesnot have any Assembly item .However the main item coantains assembly item which needs to further check for the recursion
					return;
				} */
				let x = getItemDetails(filterAssembly);
				dataItems = dataItems.concat(x);
			}
		} catch (error) {
			log.error('Error : In Get Items Details',error);
			return [];
		}
	}

	return {
		afterSubmit: AfterSubmitSO
	};

});