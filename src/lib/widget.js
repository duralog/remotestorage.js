define(['./assets', './webfinger', './hardcoded', './wireClient', './sync', './store', './platform'], function (assets, webfinger, hardcoded, wireClient, sync, store, platform) {
  var locale='en',
    connectElement,
    widgetState,
    userAddress,
    scopesObj = {};
  function translate(text) {
    return text;
  }
  function isRegistering() {
    return localStorage.getItem('remote_storage_registering');
  }
  function setRegistering(value) {
    if(value===false) {
      localStorage.removeItem('remote_storage_registering');
    } else {
      localStorage.setItem('remote_storage_registering', 'true');
    }
  }
  function calcWidgetStateOnLoad() {
    if(isRegistering()) {
      return 'registering';
    } else {
      var wireClientState = wireClient.getState();
      if(wireClientState == 'authing') {
        if(platform.harvestToken()) {
          wireClientState = 'connected';
        } else {
          return 'interrupted';
        }
      }
      if(wireClientState == 'connected') {
        return sync.getState();//'busy', 'connected' or 'offline'
      }
      return wireClientState;//'connecting' or 'anonymous'
    }
  }
  function setWidgetStateOnLoad() {
    setWidgetState(calcWidgetStateOnLoad());
  }
  function setWidgetState(state) {
    widgetState = state;
    displayWidgetState(state, userAddress);
  }
  function displayWidgetState(state, userAddress) {
    if(!localStorage.michiel) {
      state='devsonly';
    }
    var userAddress = localStorage['remote_storage_widget_useraddress'];
    var html = 
      '<style>'+assets.widgetCss+'</style>'
      +'<div id="remotestorage-state" class="'+state+'">'
      +'  <input id="remotestorage-connect-button" class="remotestorage-button" type="submit" value="'+translate('connect')+'">'//connect button
      +'  <span id="remotestorage-register-button" class="remotestorage-button">'+translate('get remoteStorage')+'</span>'//register
      +'  <img id="remotestorage-cube" src="'+assets.remoteStorageCube+'">'//cube
      +'  <span id="remotestorage-disconnect">Disconnect <strong>'+userAddress+'</strong></span>'//disconnect hover; should be immediately preceded by cube because of https://developer.mozilla.org/en/CSS/Adjacent_sibling_selectors:
      +'  <a id="remotestorage-questionmark" href="http://unhosted.org/#remotestorage" target="_blank">?</a>'//question mark
      +'  <span class="infotext" id="remotestorage-infotext">This app allows you to use your own data storage!<br>Click for more info on the Unhosted movement.</span>'//info text
      //+'  <input id="remotestorage-useraddress" type="text" placeholder="you@remotestorage" autofocus >'//text input
      +'  <input id="remotestorage-useraddress" type="text" value="michiel@mich.rs" placeholder="you@remotestorage" autofocus >'//text input
      +'  <a class="infotext" href="http://unhosted.org" target="_blank" id="remotestorage-devsonly">Local use only, no async sync yet. But modules work!<br>Click for more info on the Unhosted movement.</a>'
      +'</div>';
    platform.setElementHTML(connectElement, html);
    platform.eltOn('remotestorage-register-button', 'click', handleRegisterButtonClick);
    platform.eltOn('remotestorage-connect-button', 'click', handleConnectButtonClick);
    platform.eltOn('remotestorage-disconnect', 'click', handleDisconnectClick);
    platform.eltOn('remotestorage-cube', 'click', handleCubeClick);
    platform.eltOn('remotestorage-useraddress', 'type', handleWidgetTypeUserAddress);
  }
  function handleRegisterButtonClick() {
    setRegistering();
    var win = window.open('http://unhosted.org/en/a/register.html', 'Get your remote storage',
      'resizable,toolbar=yes,location=yes,scrollbars=yes,menubar=yes,'
      +'width=820,height=800,top=0,left=0');
    //var timer = setInterval(function() { 
    //  if(win.closed) {
    //    clearInterval(timer);
    //    setRegistering(false);
    //  }
    //}, 250);
    setWidgetState('registering');
  }
  function redirectUriToClientId(loc) {
    //TODO: add some serious unit testing to this function
    if(loc.substring(0, 'http://'.length) == 'http://') {
      loc = loc.substring('http://'.length);
    } else if(loc.substring(0, 'https://'.length) == 'https://') {
      loc = loc.substring('https://'.length);
    } else {
      return loc;//for all other schemes
    }
    var hostParts = loc.split('/')[0].split('@');
    if(hostParts.length > 2) {
      return loc;//don't know how to simplify URLs with more than 1 @ before the third slash
    }
    if(hostParts.length == 2) {
      hostParts.shift();
    }
    return hostParts[0].split(':')[0];
  }
  function dance(endpoint, oldScopes) {
    var endPointParts = endpoint.split('?');
    var queryParams = [];
    if(endPointParts.length == 2) {
      queryParams=endPointParts[1].split('&');
    } else if(endPointParts.length>2) {
      errorHandler('more than one questionmark in auth-endpoint - ignoring');
    }
    var loc = platform.getLocation();
    var scopesArr = [];
    for(var i in scopesObj) {
      if(oldScopes) {
        if(i.substring(0, '/public/'.length) != '/public/') {
          scopesArr.push(i.substring(1, i.length-1));
        }
      } else {
        scopesArr.push(i+':'+scopesObj[i]);
      }
    }
    queryParams.push('response_type=token');
    queryParams.push('scope='+encodeURIComponent(scopesArr.join(' ')));
    queryParams.push('redirect_uri='+encodeURIComponent(loc));
    queryParams.push('client_id='+encodeURIComponent(redirectUriToClientId(loc)));
    
    platform.setLocation(endPointParts[0]+'?'+queryParams.join('&'));
  }

  function discoverStorageInfo(userAddress, cb) {
    webfinger.getStorageInfo(userAddress, {timeout: 3000}, function(err, data) {
      if(err) {
        hardcoded.guessStorageInfo(userAddress, {timeout: 3000}, function(err2, data2) {
          if(err2) {
            cb(err2);
          } else {
            if(data2.type && data2.href && data.properties && data.properties['auth-endpoint']) {
              wireClient.setStorageInfo(data2.type, data2.href);
              cb(null, data2.properties['auth-endpoint']);
            } else {
              cb('cannot make sense of storageInfo from webfinger');
            }
          }
        });
      } else {
        if(data.type && data.href && data.properties && data.properties['auth-endpoint']) {
          wireClient.setStorageInfo(data.type, data.href);
          cb(null, data.properties['auth-endpoint']);
        } else {
          cb('cannot make sense of storageInfo from hardcoded');
        }
      }
    });
  }
  function handleConnectButtonClick() {
    if(widgetState == 'typing') {
      userAddress = platform.getElementValue('remotestorage-useraddress');
      localStorage['remote_storage_widget_useraddress']=userAddress;
      setWidgetState('connecting');
      discoverStorageInfo(userAddress, function(err, auth) {
        if(err) {
          setWidgetState('failed');
        } else {
          dance(auth, false);
        }
      });
    } else {
      setWidgetState('typing');
    }
  }
  function handleDisconnectClick() {
    if(widgetState == 'connected') {
      wireClient.disconnectRemote();
      store.forgetAll();
      setWidgetState('anonymous');
    } else {
      alert('you cannot disconnect now, please wait until the cloud is up to date...');
    }
  }
  function handleCubeClick() {
    setWidgetState('busy');
    sync.syncNow('/', function(success) {
      setWidgetState((success?'connected':'offline'));
    });
    //if(widgetState == 'connected') {
    //  handleDisconnectClick();
    //}
  }
  function handleWidgetTypeUserAddress() {
    setRegistering(false);
    console.log('handleWidgetTypeUserAddress');
  }
  function handleWidgetHover() {
    console.log('handleWidgetHover');
  }
  function display(setConnectElement, setLocale) {
    var tokenHarvested = platform.harvestParam('access_token');
    var storageRootHarvested = platform.harvestParam('storage_root');
    var storageApiHarvested = platform.harvestParam('storage_api');
    var authorizeEndpointHarvested = platform.harvestParam('authorize_endpoint');
    if(tokenHarvested) {
      wireClient.setBearerToken(tokenHarvested);
    }
    if(storageRootHarvested) {
      wireClient.setStorageInfo(storageApiHarvested, storageRootHarvested);
    }
    if(authorizeEndpointHarvested) {
      dance(authorizeEndpointHarvested, false);
    }
    connectElement = setConnectElement;
    locale = setLocale;
    wireClient.on('error', function(err) {
      platform.alert(translate(err));
    });
    wireClient.on('state', setWidgetState);
    setWidgetStateOnLoad();
  }
  function addScope(module, mode) {
    if(!scopesObj[module] || mode == 'rw') {
      scopesObj[module] = mode;
    }
  }
  
  return {
    display : display,
    addScope: addScope
  };
});
