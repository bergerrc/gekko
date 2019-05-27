#!/bin/bash

initUiConfig(){
    echo 'initUIConfig'
    [ ! -z "$HEADLESS" ] && sed -i -r 's/(headless: )\w+/\1'${HEADLESS}'/g' /usr/src/app/web/vue/dist/UIconfig.js && echo 'HEADLESS: '${HEADLESS}
    [ ! -z "$API_HOST" ] && sed -i "s/'127.0.0.1'/'"${API_HOST}"'/g"            /usr/src/app/web/vue/dist/UIconfig.js && echo 'API_HOST: '${API_HOST}
    [ ! -z "$HOST" ]     && sed -i "s/'localhost'/'"${HOST}"'/g"                /usr/src/app/web/vue/dist/UIconfig.js && echo 'HOST: '${HOST}
    [ ! -z "$PORT" ]     && sed -i 's/3000/'${PORT}'/g'                     /usr/src/app/web/vue/dist/UIconfig.js && echo 'PORT: '${PORT}
    [ ! -z "$API_TIMEOUT" ]   && sed -i 's/120000/'${API_TIMEOUT}'/g'                     /usr/src/app/web/vue/dist/UIconfig.js && echo 'API_TIMEOUT: '${API_TIMEOUT}
    [ ! -z "$UI_PATH" ]  && sed -i -r "s/(path[ ]*[:=][ ]*').+'/\1"${UI_PATH}"'/g"        /usr/src/app/web/vue/dist/UIconfig.js && echo 'UI_PATH: '${UI_PATH}
    [ ! -z "$ADAPTER" ]  && sed -i -r "s/(adapter[ ]*[:=][ ]*')\w+'/\1"${ADAPTER}"'/g"    /usr/src/app/web/vue/dist/UIconfig.js && echo 'ADAPTER: '${ADAPTER}
}

initConfigFile () {
    echo 'initConfigFile: '${CONFIG_FILE}
    #echo 'GOOGLE_APPLICATION_CREDENTIALS: '${GOOGLE_APPLICATION_CREDENTIALS}
    # Used when background config file is not prepared for environment variables
    [ ! -z "$ADAPTER" ]             && sed -i -r "s/(adapter[ ]*[:=][ ]*')\w+'/\1"${ADAPTER}"'/g"                         $1 && echo 'ADAPTER: '${ADAPTER}
    [ ! -z "$GCLOUD_PROJECT_ID" ]   && sed -i -r "s/(projectId:[ ]+').+'/\1"${GCLOUD_PROJECT_ID}"'/g"                     $1 && echo 'GCLOUD_PROJECT_ID: '${GCLOUD_PROJECT_ID}
    [ ! -z "$BIGQUERY_DATASET_ID" ] && sed -i -r "s/(datasetId:[ ]+').+'/\1"${BIGQUERY_DATASET_ID}"'/g"                   $1 && echo 'BIGQUERY_DATASET_ID: '${BIGQUERY_DATASET_ID}
    [ ! -z "$TELEGRAM_TOKEN" ]      && sed -i -r "s/(config.telegrambot.token[ ]+=[ ]+').+'/\1"${TELEGRAM_TOKEN}"'/g"     $1 && echo 'TELEGRAM_TOKEN: (secret)'
    [ ! -z "$TELEGRAM_BOTNAME" ]    && sed -i -r "s/(config.telegrambot.botName[ ]+=[ ]+').+'/\1"${TELEGRAM_BOTNAME}"'/g" $1 && echo 'TELEGRAM_BOTNAME: '${TELEGRAM_BOTNAME}
}

# Used for UI launch only
if [ "$1" == '--ui' ] ; then
    echo "UI"
    if [ ! -z "$CONFIG_FILE" ]; then
        initConfigFile "$CONFIG_FILE"
        CONFIG_OUTPUT=$(node $CONFIG_FILE)
        [ -z $CONFIG_OUTPUT ] && CONFIG_OUTPUT=$(echo $(cut -d'.' -f 1 <<< $CONFIG_FILE)"-ui.js")
        if [ ! -z $CONFIG_OUTPUT ] && [ -f $CONFIG_OUTPUT ]; then
            ln -srb $CONFIG_OUTPUT /usr/src/app/web/vue/dist/UIconfig.js
            ln -srb $CONFIG_OUTPUT /usr/src/app/web/routes/baseConfig.js
            echo "$CONFIG_OUTPUT linked to be used as UIconfig"
        fi
    fi
#    if [ "$2" == '--config' ] && [ ! -z "$3" ] && [ -z "$CONFIG_FILE" ]; then
#        initConfigFile "$3"
#        ln -srb $3 /usr/src/app/web/vue/dist/UIconfig.js
#        ln -srb $3 /usr/src/app/web/routes/baseConfig.js
#    fi
    if [ -z "$CONFIG_FILE" ]; then
        initUiConfig
    fi
else
    echo "background"
    if [ ! -z "$CONFIG_FILE" ]; then
        initConfigFile "$CONFIG_FILE"
    fi
    #if [ "$2" == '--config' ] && [ ! -z "$3" ] && [ -z "$CONFIG_FILE" ]; then
    #    initConfigFile "$3"
    #fi
fi

exec node gekko "$@"
