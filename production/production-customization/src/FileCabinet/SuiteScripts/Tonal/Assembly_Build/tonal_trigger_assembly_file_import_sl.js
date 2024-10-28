/**
 * tonal_trigger_assembly_file_import_sl.js
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/ui/message', 'N/ui/serverWidget', 'N/task'],
    function(search, message, serverWidget, task) {
        function onRequest(context) {
            var form = serverWidget.createForm({
                title: 'Assembly File Import',
                hideNavBar: false
            });

            form.addSubmitButton({label:'Process File(s)'});
            var htmlField = form.addField({
                id: 'custpage_tnl_html_fld',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });

            var tHtml = '<h1 style="margin-top:30px; font-size: 2em">Step 1:</h1><p style="font-size:1.3em">Upload your file(s) to the <a href="/app/common/media/mediaitemfolders.nl?folder=439" target="_blank">Pending Folder</a></p>';
            tHtml += '<h1 style="margin-top:5px; font-size: 2em">Step 2:</h1><p style="font-size:1.3em">Click the "Process File(s)" button above or below!</p>';

            htmlField.defaultValue = tHtml;

            if (context.request.method == 'POST') {
                var mrScriptTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: 'customscript_tnl_assembly_file_proc',
                    deploymentId: 'customdeploy_tnl_assembly_file_proc_1',
                });
                mrScriptTask.submit();
                var msg = message.create({
                    title: "Success",
                    message: "The Script Has Been Successfully Scheduled For Processing!",
                    type: message.Type.CONFIRMATION
                });
                form.addPageInitMessage({message: msg});
            }

            context.response.writePage({pageObject:form});
        }

        return {
            onRequest: onRequest
        };

    }
);
