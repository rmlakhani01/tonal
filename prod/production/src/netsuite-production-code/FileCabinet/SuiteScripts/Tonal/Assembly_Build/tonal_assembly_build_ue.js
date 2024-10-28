/**
 * tonal_assembly_build_ue.js
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
*/
define(['N/record', 'N/search', 'N/format', '../Library/bb_library.js'],
	function(record, search, format, bbLibrary){
		function afterSubmit(context){
			if(context.type != 'create') {
				return false;
			}

			var nrec = context.newRecord;
			var locCollection = {};
			var curLoc = nrec.getValue({fieldId:'location'});
			var buildItem = nrec.getValue({fieldId:'item'});
			var buildSerials = [];
			var buildSerialTexts = [];
			var newAssetRec;

			var buildItemDetail = search.lookupFields({
				type: 'item',
				id: buildItem,
				columns: ['custitem_bb_field_asset_item','itemid']
			});

			if (!buildItemDetail || !buildItemDetail.custitem_bb_field_asset_item){
				// The item being built is not an asset item so return
				return false;
			}

			var buildWorkOrder = nrec.getValue({fieldId:'createdfrom'});
			if (!buildWorkOrder) {
				// The build has no associated work order so return
				return false;
			}
			buildWorkOrder = record.load({
				type: 'workorder',
				id: buildWorkOrder
			});

			// Get Inventory Detail From Build
			if(!nrec.hasSubrecord('inventorydetail')) {
				log.error({title:'Assembly Build For Non-Serialized Assembly', details: 'Unable To Create Asset Record'});
				return false;
			}
			var bInvDetail = nrec.getSubrecord({fieldId:'inventorydetail'});
			for (var i = 0; i < bInvDetail.getLineCount({sublistId:'inventoryassignment'}); i++) {
				var curSerial = bInvDetail.getSublistValue({sublistId:'inventoryassignment', fieldId:'receiptinventorynumber', line: i});
				// Create Field Asset Record
				newAssetRec = record.create({
					type: 'customrecord_bb_field_asset',
					isDynamic: true
				});
				newAssetRec.setValue({fieldId:'name', value: curSerial});
				newAssetRec.setValue({fieldId:'custrecord_bb_asset_item', value: buildItem});
				newAssetRec.setValue({fieldId:'custrecord_bb_asset_serial_assigned', value: true});

				var nAssetId = newAssetRec.save();
				buildSerials.push(nAssetId);
				buildSerialTexts.push(curSerial);
			}

			// Loop lines to find the specific items to create records for.
			for(var i = 0; i < nrec.getLineCount({sublistId:'component'}); i++){
				var curLineQty = nrec.getSublistValue({sublistId:'component', fieldId:'quantity',line:i});
				var curLineItem = nrec.getSublistValue({sublistId:'component',fieldId:'item',line:i});

				// Get Item Detail
				var itemDetail = search.lookupFields({
					type: 'item',
					id: curLineItem,
					columns: ['custitem_bb_field_asset_item','itemid']
				});

				if (itemDetail && itemDetail.custitem_bb_field_asset_item){
					// Get Serials From Work Order
					var itemSerials = buildWorkOrder.getSublistValue({sublistId:'item', fieldId:'custcol_nappjo_custom_serial', line:i});
					if (itemSerials) {
						itemSerials = itemSerials.split(',');
					} else {
						itemSerials = [];
					}

					// Get Asset Records For Components
					var componentAssetRecs = bbLibrary.getAssetRecordsByItem(curLineItem);

					if (componentAssetRecs.length) {
						for (var x = 0; x < itemSerials.length; x++) {
							// Update Component Asset Recs
							record.submitFields({
								type: 'customrecord_bb_field_asset',
								id: componentAssetRecs[x].id,
								values: {
									parent: buildSerials[0], // Only Getting The First Build Serial As We Are Doing A 1 to 1 Build -- Only Building 1 Serial Per Work Order
									name: itemSerials[x],
									custrecord_bb_asset_serial_assigned: true
								}
							});
						}
					}
				}
			}

			// Get Related Component Records
			if (buildSerialTexts.length) {
				var relatedAssetSearch = search.create({
					type: 'customrecord_bb_fa_related_components',
					filters: [
						['custrecord_bb_fa_related_board_serial','startswith',buildSerialTexts[0]],
						'and',
						['custrecord_bb_fa_comp_assigned','is','F']
					],
					columns:  ['custrecord_bb_fa_related_comp_part','custrecord_bb_fa_related_comp_serial']
				}).run().getRange({start:0,end:100});

				for (var i = 0; i < relatedAssetSearch.length; i++) {
					var nAssetRec = record.create({
						type:'customrecord_bb_field_asset',
					});
					nAssetRec.setValue({fieldId:'name', value:relatedAssetSearch[i].getValue({name:'custrecord_bb_fa_related_comp_serial'})});
					nAssetRec.setValue({fieldId:'parent', value: buildSerials[0]});
					nAssetRec.setText({fieldId:'custrecord_bb_asset_item', text: relatedAssetSearch[i].getValue({name:'custrecord_bb_fa_related_comp_part'})});
					nAssetRec.setValue({fieldId:'custrecord_bb_asset_serial_assigned', value: true});
					nAssetRec.setValue({fieldId:'custrecord_bb_asset_removed', value: false});

					try {
						nAssetRec.save({ignoreMandatoryFields: true, enableSourcing: true});
						record.delete({
							type:'customrecord_bb_fa_related_components',
							id: relatedAssetSearch[i].id
						});
					} catch(e) {
						log.error({details:'RELATED COMPONENT FAILURE - ' + relatedAssetSearch[i].id, details: e.message});
					}
				}
			}
		}
		return{
			afterSubmit: afterSubmit
		};
	}
);
