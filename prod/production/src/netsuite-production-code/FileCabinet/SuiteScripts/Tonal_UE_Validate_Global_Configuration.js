/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : Client Script
 * Script Name : Tonal UE Validate Global Configuration
 * File Name   : Tonal_UE_Validate_Global_Configuration.js
 * Description : This script is used for hide/show field on the Global Configuration. Add config data in script parameter
 * Created On  : 20/10/2023
 * Modification Details:  
 ************************************************************/
define(["N/runtime","N/ui/serverWidget"], function(runtime,serverWidget) {

    const beforeLoad = (context) => {
        try {
            let ct = context.type;
            log.debug('ct==',ct);
            if(ct == 'view' || ct == 'edit'){
                let scriptObj = runtime.getCurrentScript();
                let appConfig = scriptObj.getParameter('custscript_configuration1');
                log.debug('appConfig==',appConfig);
                if(!appConfig){
                    return;
                }
                let recObj = context.newRecord;
                let formObj = context.form;
                let name = recObj.getValue('name');
                log.debug('name==',name);

                if(name){

                    //find the name in the congig JSON
                    appConfig = JSON.parse(appConfig);
                    let configData = appConfig.app_config_data;
                    log.debug('configData=='+configData.length,configData);
        
                    let index = configData.findIndex(function(obj){
                        return obj.app_name == name;
                    });
        
                    log.debug('index==',index);
        
                    if(index > -1){
                        //hide the other fields only show required filed for the current record
                        let appName = configData[index].app_name;
                        if(appName == 'MuleSoft'){
                            let warrantyorderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_warranty_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
        
                            let extendOrderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendContractApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_cont_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendLeadApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_lead_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyWarrantyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_warranty_order_api'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
                        }
                        if(appName == 'MuleSoft-Warranty'){
                            let orderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
        
                            let extendOrderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendContractApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_cont_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendLeadApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_lead_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyWarrantyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_warranty_order_api'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
                            
                        }
                        if(appName == 'MuleSoft-Extend'){
                            let orderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
        
                            let warrantyOrderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_warranty_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyWarrantyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_warranty_order_api'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
                        }
                        if(appName == 'MuleSoft-Best-Buy-Orders'){
                            let orderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
        
                            let warrantyOrderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_warranty_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendOrderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendContractApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_cont_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendLeadApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_lead_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyWarrantyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_warranty_order_api'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
                            
                        }
                        if(appName == 'MuleSoft-Best-Buy-Warranty'){
                            let orderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
        
                            let warrantyOrderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_warranty_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendOrderApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendContractApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_cont_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let extendLeadApi = formObj.getField({
                                id: 'custrecord_tnl_ms_extend_lead_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });

                            let bbyOrder = formObj.getField({
                                id: 'custrecord_tnl_ms_bby_order_api_url'
                            }).updateDisplayType({
                                displayType : serverWidget.FieldDisplayType.HIDDEN
                            });
                        }
                    }

                }
            }
        } catch (error) {
            log.error('Error : In Before Load',error);
        }
    }

    return {
        beforeLoad: beforeLoad
    }
});
