YAHOO.namespace('YAHOO.ELSA');

// Need to alter this method slightly so we can set custom sizes
YAHOO.widget.TextareaCellEditor.prototype.move = function() {
	this.textarea.style.width = this.width || this.getTdEl().offsetWidth + "px";
	this.textarea.style.height = this.height || "3em";
	YAHOO.widget.TextareaCellEditor.superclass.move.call(this);
};

YAHOO.ELSA.queryResultCounter = 0;
YAHOO.ELSA.localResults = [];
YAHOO.ELSA.viewMode = 'prod';
YAHOO.ELSA.panels = {};
YAHOO.ELSA.overlayManager = new YAHOO.widget.OverlayManager();
YAHOO.ELSA.logger = new Object;
YAHOO.ELSA.localGroupByQueryLimit = 1000; //number of recs to download locally and group by on
YAHOO.ELSA.Labels = {
	noTerm: 'Add Term',
	noGroupBy: 'None',
	defaultGroupBy: 'Report On',
	index: 'Index',
	archive: 'Archive',
	index_analytics: 'Index Analytics (Map/Reduce)',
	archive_analytics: 'Archive Analytics (Map/Reduce)'
};
YAHOO.ELSA.TimeTranslation = {
	Days: [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ],
	Months: [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ]
};

YAHOO.ELSA.initLogger = function(){
	/* Setup logging */
	if (YAHOO.ELSA.viewMode == 'dev'){
		YAHOO.widget.Logger.categories.push('elsa');
		logger = new YAHOO.ELSA.ConsoleProvider();
		if (typeof(console) == 'undefined'){
			var myLogReader = new YAHOO.widget.LogReader("logger");
			myLogReader.collapse();
			var tildeKeyListener = function(event){
				if(event && event.keyCode && event.keyCode==192){
					if(event.target && (event.target.nodeName=='INPUT' || event.target.nodeName=='TEXTAREA')){
						return true;
					}
					if(myLogReader.isCollapsed){
						myLogReader.expand();
					}else{
						myLogReader.collapse();
					}
				}
			}
			try{
				var w = new YAHOO.util.Element(document);
				w.subscribe("keyup", tildeKeyListener); 
			}catch(e){
				logger.log('Error subscribing document keyup', e);
			}
		}
	}
	else {
		// Just create dummy logging functionality
		var fakeLogger = function(){};
		fakeLogger.prototype = {
		    log: function(msg, lvl) {
			}
		};
		logger = new fakeLogger();
	}
};

YAHOO.ELSA.getLocalResultId = function(p_oTab){
	// find the result that has this tabid
	var iTabIndex = YAHOO.ELSA.tabView.getTabIndex(p_oTab);
	for (var i in YAHOO.ELSA.localResults){
		if (typeof YAHOO.ELSA.localResults[i].tabId != 'undefined' && YAHOO.ELSA.localResults[i].tabId == iTabIndex){
			return i;
		}
	}
	logger.log('Unable to find local result for tab ' + iTabIndex);
}

YAHOO.ELSA.getLocalResultIdFromQueryId = function(p_iQid){
	for (var i in YAHOO.ELSA.localResults){
		if (typeof YAHOO.ELSA.localResults[i].id != 'undefined' && YAHOO.ELSA.localResults[i].id == p_iQid){
			return i;
		}
	}
	logger.log('Unable to find local result for qid ' + p_iQid);
}

YAHOO.ELSA.updateTabIds = function(p_iRemovedTabId){
	logger.log('updating tab ids');
	for (var i in YAHOO.ELSA.localResults){
		logger.log('id: ' + YAHOO.ELSA.localResults[i].id + ', tabid: ' + YAHOO.ELSA.localResults[i].tabId);
	}
	// decrement any results that had a tab id greater than or equal to the tab that was removed so that everything is synced
	for (var i in YAHOO.ELSA.localResults){
		if (YAHOO.ELSA.localResults[i].tabId >= p_iRemovedTabId){
			logger.log('decrementing tabId ' + YAHOO.ELSA.localResults[i].tabId);
			YAHOO.ELSA.localResults[i].tabId--;
		}	
	}
}

YAHOO.ELSA.LogWriter = function() {
    this.myLogReader = new YAHOO.widget.LogReader("logger");
    var lR = this.myLogReader;
    YAHOO.widget.Logger.log("My log message", 'error');
    //Modify the footer to container a search box.
    var logFt = this.myLogReader._elFt;
    //Add event handler that modifies _elConsole
    var keyupHandler = function(event){
    	var s = event.target;
    	if(!s || !s.value){
    		lR.resume();
    		return true;
    	}
    	lR.pause();//Keyup event shows up on top of the ones that we're hiding, so stop it for now.
    	var searchVal = s.value;
    	var logConsole = lR._elConsole;
    	var pres = logConsole.getElementsByTagName('pre');
    	//build regexp based on the given words to ignore extra spaces and what-not
    	var reArray = [];
    	var words = (searchVal && searchVal!='') ? searchVal.split(' '):[];
    	for(var w in words){
    		if(words[w]==' ' || words[w]==''){
    			continue;
    		}
    		var esc = words[w].replace(/([\\\/\.\*\?\+\-\^\$\(\)\{\}\[\]])/g, '\\$1');
    		reArray.push(esc);
    		
    	}
    	var re = new RegExp(RegExp.escape(reArray.join('\\s+')));
    	for(var p in pres){
    		if(typeof(pres[p])=='object' && pres[p]){
	    		if(!pres[p] || !pres[p].innerHTML){
	    			continue;
	    		}

	    		if(searchVal==''){//Nothing in searchVal
	    			YAHOO.util.Dom.removeClass(pres[p], 'hiddenElement');
	    			continue;
	    		}
	    		//take the innerHTML, strip out markup, then compare the resulting text
	    		var searchTxt = pres[p].innerHTML.replace(/<\/?\w.*?>/ig,'');
	    		//Replace HTML encoded entities with their equivalent string
	    		searchTxt = searchTxt.replace('&gt;', '>').replace('&lt;', '<').replace('&amp;', '&').replace('&quot;', '"').replace("&apos;", "'");
	    		//Ideally, we would replace hex encoded values, too
	    		try{
	    			//Based on initial tests, it looks like this is useless, but I'll leave it in, anyway
		    		searchTxt = searchTxt.replace(/&#x([0-9A-Za-z]+);/ig, unescape('%$1'));
	    		}catch(e){
	    			logger.log(e+' occurred while removing hex-encoded values from the search string.');
	    		}
	    		if(!searchTxt.match(re)){
	    			YAHOO.util.Dom.addClass(pres[p], 'hiddenElement');
	    		}else{
	    			YAHOO.util.Dom.removeClass(pres[p], 'hiddenElement');
	    		}
    		}
    	}
    }
    //Create search box
    var sinput = document.createElement('input');
    var search = new YAHOO.util.Element(sinput);
    search.subscribe('keyup', keyupHandler);
    var sc = document.createElement('div');
    var span = document.createElement('span');
    span.appendChild(document.createTextNode('Filter:'));
    span.className = 'inputLabel';
	
	//Create checkbox that checks/unchecks all checkboxes in  
	var cbox = document.createElement('input');
	cbox.id = 'AllLoggerToggle';
	var clabel = document.createElement('label');
	clabel.className = 'inputLabel';
	clabel.appendChild(document.createTextNode('Select/Clear All'));
	clabel.setAttribute('for', 'AllLoggerToggle');
	
    var changeHandler = function(event){
    	var s = event.target;
    	if(!s){return false;}
    	var checkem = s.checked;
    	var inputs = logFt.getElementsByTagName('input');
    	for(var i in inputs){
    		if(inputs[i] && inputs[i].nodeType==1 && inputs[i].getAttribute('type')=='checkbox'){
				inputs[i].checked=checkem;
				var category = inputs[i].className.replace(/yui\-log\-filter/, '');
				if(category && category.substr(0,1)=='-'){
    				category = category.substr(1);
    				if(checkem){
    					lR.showCategory(category);
    				}else{
    					lR.hideCategory(category);
    				}
				}else{
    				if(checkem){
    					lR.showSource(category);
    				}else{
    					lR.hideSource(category);
    				}
				}
    		}
    	}
    	if(checkem){
    		//apply filter
    		keyupHandler({target:sinput});
    	}
    }
    
	cbox.setAttribute('type', 'checkbox');
	cbox.setAttribute('checked', true);
	var cboxObj = new YAHOO.util.Element(cbox);
	cboxObj.subscribe('change', changeHandler);
	var cdiv = document.createElement('div');
	cdiv.appendChild(cbox);
	cdiv.appendChild(clabel);
	//Add elements to the console
	sc.appendChild(document.createElement('hr'));
	sc.appendChild(cdiv);
	
	
    sc.appendChild(span); 
    sc.appendChild(sinput);
    
    logFt.appendChild(sc);
    //Hide it and make it open when the user presses ~
	lR.collapse();
	
	return this;
};

YAHOO.ELSA.ConsoleProvider = function(){};
YAHOO.ELSA.ConsoleProvider.prototype = {
    log: function(msg, lvl) {
    	// use the error console if available (FF+FireBug or Safari)
    	if(typeof(console)=='object' && console && typeof(console.log)=='function'){
    		for(var a =0; a<arguments.length;a++){
    			console.log(arguments[a]);
    		}
    	}else{
    		if(!lvl || typeof(lvl)!='string'){
    			lvl='elsa';
    		}else{
    			var lvl_tmp = '';
    			for(var c=0; c<YAHOO.widget.Logger.categories.length; c++){
    				var category = YAHOO.widget.Logger.categories[c];
    				if(category==lvl){
    					lvl_tmp = category;
    				}
    			}
    			lvl = lvl_tmp ? lvl_tmp : 'elsa';
    		}
    		YAHOO.log(msg, lvl);
    	}
    }
};

YAHOO.ELSA.cancelQuery = function(p_oEvent, p_aArgs){
	var iQid = p_aArgs[0];
	// Send xhr to tell the backend to call off the search
	var request = YAHOO.util.Connect.asyncRequest('GET', 
		'Query/cancel_query?qid=' + iQid,
		{ 
			success:function(oResponse){
				var oPanel = new YAHOO.ELSA.Panel('cancel_query');
				oPanel.panel.setHeader('Cancelling Query');
				oPanel.panel.setBody('Cancelling query with ID ' + iQid + '.  You will be able to issue a new archive query soon.  It may take several minutes to cancel the query.');
				oPanel.panel.show();
				return true;
			}, 
			failure:function(oResponse){
				YAHOO.ELSA.Error('Query cancel failed!'); 
				return false;
			}
		}
	);
}

YAHOO.ELSA.getRunningArchiveQuery = function(){
	// Send xhr to find any current archive queries
	var request = YAHOO.util.Connect.asyncRequest('GET', 
		'Query/get_running_archive_query',
		{ 
			success:function(oResponse){
				if (oResponse.responseText){
					var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
					if (typeof oReturn === 'object'){
						if (oReturn['error']){
							YAHOO.ELSA.Error(oReturn['error']);
						}
						else {
							logger.log('got running query ' + oReturn.qid);
							var oPanel = new YAHOO.ELSA.Panel('cancel_query');
							oPanel.panel.setHeader('Cancel Query');
							if (oReturn.qid && oReturn.qid != 0){
								oPanel.panel.setBody('');
								var aEl = document.createElement('a');
								aEl.innerHTML = 'Cancel Query ' + oReturn.qid;
								aEl.href = '#';
								oPanel.panel.appendToBody(aEl);
								var oEl = new YAHOO.util.Element(aEl);
								oEl.on('click', YAHOO.ELSA.cancelQuery, [oReturn.qid], this);
							}
							else {
								oPanel.panel.setBody('No currently running archive query to cancel.');
							}
							oPanel.panel.show();
							return true;
						}
					}
					else {
						logger.log(oReturn);
						YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
					}
				}
				else {
					YAHOO.ELSA.Error('No response text');
				}
				
			}, 
			failure:function(oResponse){
				YAHOO.ELSA.Error('Query cancel failed!'); 
				return false;
			}
		}
	);
}

YAHOO.ELSA.Query = function(){
	
	
	this.terms = {};
	this.metas = {
		limit: 100 //default limit
	};
	this.freetext = '';
	
	this.resetTerms = function(){
		logger.log('resetting class fields from ', this);
		this.terms = {};
		this.freetext = '';
		
		return true;
	}
	
	this.resetMetas = function(){
		this.metas = {};
		return true;
	}
	
//	this.reset = function(){
//		logger.log('resetting from ', this);
//		this.terms = {};
//		this.metas = {};
//		this.freetext = '';
//		
//		// Reset the class button
//		var oButton = YAHOO.widget.Button.getButton('class_select_button');
//		oButton.set('label', 'All');
//		
//		// Reset the group by button
//		oButton = YAHOO.widget.Button.getButton('groupby_select_button');
//		oButton.set('label', 'None');
//		
//		return true;
//	}
	
	//this.results = new YAHOO.ELSA.Results();
	
	this.booleanMap = {
		'OR': '',
		'AND': '+',
		'NOT': '-'
	};
	this.queryBoolean = '';
	this.setBoolean = function(p_sBoolean){
		if (p_sBoolean && typeof this.booleanMap[ p_sBoolean.toUpperCase() ] != 'undefined'){
			this.queryBoolean = this.booleanMap[ p_sBoolean.toUpperCase() ];
		}
		else {
			YAHOO.ELSA.Error('Invalid boolean given: ' + p_sBoolean);
		}
	}
	
	this.submit = function(){
		// apply the start/stop times
		if (YAHOO.util.Dom.get('start_time').value){
			var sStartTime = getDateFromISO(YAHOO.util.Dom.get('start_time').value)/1000;
			this.addMeta('start', sStartTime);
		}
		if (YAHOO.util.Dom.get('end_time').value){
			var sEndTime = getDateFromISO(YAHOO.util.Dom.get('end_time').value)/1000;
			this.addMeta('end', sEndTime);
		}
		logger.log('submitting query: ', this);
		try {
			var oResults = new YAHOO.ELSA.Results.Tabbed.Live(YAHOO.ELSA.tabView, this);
			logger.log('got query results:', oResults);
			this.resetTerms();
		} catch(e) { YAHOO.ELSA.Error(e); }
	}
	
	this.addTermFromOnClick = function(p_oEvent, p_aArgs){
		logger.log('p_oEvent', p_oEvent);
		logger.log('p_aArgs', p_aArgs);
		var p_sField = p_aArgs[0];
		var p_sValue = p_aArgs[1];
		var p_Op = p_aArgs[2];
		var p_oEl = p_aArgs[3];
		this.addTerm(p_sField, p_sValue, p_Op, p_oEl);
	}
	
	this.addTerm = function(p_sField, p_sValue, p_Op, p_oEl){
		if (!p_sValue){
			var aMatches = p_sField.split(/([\:<>=]+)/);
			p_sField = aMatches[0];
			p_Op = aMatches[1];
			p_sValue = aMatches[2];
		}
		if (!p_Op){
			p_Op = '=';
		}
		
		// Quote if necessary
		if (p_sValue.match(/[^a-zA-Z0-9\.\-\@\_]/) && !p_sValue.match(/^\"[^\"]+\"$/)){
			p_sValue = '"' + p_sValue + '"';
		}
		
		logger.log('adding to current query field:' + this.queryBoolean + p_sField + ', val: ' + p_sValue);
		var formField;
		if (p_oEl){
			formField = p_oEl;
		}
		else {
			formField = YAHOO.util.Dom.get(p_sField);
		}
		if (!formField){
			// Must be the main query bar
			formField = 'q';
		}
		var oEl = new YAHOO.util.Element(formField);
		logger.log('oEl', oEl);
		var oQ = YAHOO.util.Dom.get('q');
		if (p_sField){
			if (p_sField.match(/^Transform\./)){
				var aMatches = p_sField.match(/^Transform\.([^\.]+)\.([^\.]+)\.([^\.]+)/);
				var sTransform = aMatches[1];
				var sLogField = aMatches[2];
				var sTransformField = aMatches[3];
				oQ.value += ' | grep(' + sTransformField + ',' + p_sValue + ')';
			}
			else if (this.validateTerm(p_sField, p_sValue)){
				var aField = p_sField.split(/\./);
				var sClass = aField[0];
				var sField = aField[1];
				if (!sField){
					sField = sClass;
					sClass = '';
				}
				
				if (sClass == 'any' || sClass == ''){ //special case for 'any' class as it causes issues on the backend
					var oTimeConversions = {
						'timestamp': 1,
						'minute': 60,
						'hour': 3600,
						'day': 86400
					};
					if (oTimeConversions[sField]){
						var oStartDate = getDateFromISO(p_sValue);
						var iMs = oStartDate.getTime();
						logger.log('adding ' + (oTimeConversions[sField] * 1000) + ' to ' + iMs);
						iMs += (oTimeConversions[sField] * 1000);
						var oEndDate = new Date();
						oEndDate.setTime(iMs);
						YAHOO.util.Dom.get('start_time').value = getISODateTime(oStartDate);
						YAHOO.util.Dom.get('end_time').value = getISODateTime(oEndDate);
					}
					else {
						this.terms[p_sField] = p_sValue;
						oQ.value += ' ' + this.queryBoolean + sField + p_Op + p_sValue;
					}
				}
				else {
					this.terms[p_sField] = p_sValue;
					oQ.value += ' ' + this.queryBoolean + sClass + '.' + sField + p_Op + p_sValue;
				}
				
				oEl.removeClass('invalid');
				return true;
			}
			else {
				YAHOO.ELSA.Error('Invalid value ' + p_sValue + ' for field ' + p_sField);
			}
		}
		else {
			// No validation necessary because we don't have a field
			YAHOO.ELSA.Error('added term without a field');
		}
	}
	
	this.delTerm = function(p_sField){
		logger.log('removing current query field:' + p_sField);
		delete this.terms[p_sField];
		return true;
	}
	
	this.addMeta = function(p_sField, p_sValue){
		logger.log('adding to current query meta:' + p_sField + ', val: ' + p_sValue);
		if (this.validateMeta(p_sField, p_sValue)){
			this.metas[p_sField] = p_sValue;
			return true;
		}
		else {
			YAHOO.ELSA.Error('invalid value ' + p_sValue + ' given for meta ' + p_sField);
			return false;
		}
	}
	
	this.delMeta = function(p_sField){
		logger.log('removing current query meta:' + p_sField);
		delete this.metas[p_sField];
		return true;
	}
	
	this.stringifyTerms = function(){
		var sQuery = YAHOO.util.Dom.get('q').value; //.replace(/\ [\-\.]\ /g, ' ');
		return sQuery; //YAHOO.util.Dom.get('q').value;
	}
	
//	this.stringifyMetas = function(){
//		var sQuery = '';
//		logger.log('stringifying: ', this.metas);
//		for (var field in this.metas){
//			logger.log('field: '  + field + ', value: ' + this.metas[field]);
//			sQuery += field + ':' + '"' + this.metas[field] + '"';
//		}
//		logger.log('returning: ' + sQuery);
//		return sQuery;
//	}
	
	this.toString = function(){
		return YAHOO.lang.JSON.stringify( 
			{ 
				'query_string' : this.stringifyTerms(),
				'query_meta_params' : this.metas
			}
		);
	}
	
	this.toObject = function(){
		return { query_string: YAHOO.ELSA.currentQuery.stringifyTerms(), query_meta_params: this.metas };
	}
	
	this.validateTerm = function(p_sFQDNField, p_sValue){
		logger.log('validating ' + p_sFQDNField + ':' + p_sValue);
		
		var oField;
		var oMetas = {
			'class': 1,
			'any.class': 1,
			'program': 1,
			'any.program': 1,
			'timestamp': 1,
			'any.timestamp': 1,
			'minute': 1,
			'any.minute': 1,
			'hour': 1,
			'any.hour': 1,
			'day': 1,
			'any.day': 1,
			'node': 1,
			'any.node': 1
		};
		if (oMetas[p_sFQDNField]){
			return this.validateMeta(p_sFQDNField, oMetas[p_sFQDNField]);
		}
		for (var i = 0; i < YAHOO.ELSA.formParams.fields.length; i++){
			if (YAHOO.ELSA.formParams.fields[i].fqdn_field && YAHOO.ELSA.formParams.fields[i].fqdn_field.toUpperCase() == p_sFQDNField.toUpperCase()){
				oField = YAHOO.ELSA.formParams.fields[i];
				break;
			}
			else if (YAHOO.ELSA.formParams.fields[i].value && YAHOO.ELSA.formParams.fields[i].value.toUpperCase() == p_sFQDNField.toUpperCase()){
				oField = YAHOO.ELSA.formParams.fields[i];
				break;
			}
		}
		logger.log('oField:',oField);
		if (!oField){
			return false;
		}
		var oRegex = this.getInputRegex(oField);
		logger.log('testing ' + p_sValue + ' against ' + oField.input_validation);
		return oRegex.test(p_sValue);
	}
	
	this.validateMeta = function(){
		return true;
	}
	
	this.getInputRegex = function(p_oField){
		if (p_oField['input_validation']){
			if (p_oField['fqdn_field'] == 'ANY.host'){
				return new RegExp(/^['"]?[a-zA-Z0-9\-\.]+['"]?$/);
			}
			else {
				switch (p_oField['input_validation']){
					case 'IPv4':
						return new RegExp(/^['"]?\d+\.\d+\.\d+\.\d+['"]?$/);
					default:
						YAHOO.ELSA.Error('Unknown input_validation: ' + p_oField['input_validation']);
				}
			}
		}
		else {	
			switch (p_oField['type']){
				case 'int':
					return new RegExp(/^\d+$/);
				case 'string':
					//return new RegExp(/^.+$/);
				default:
					return new RegExp(/^.+$/);
			}
		}
	}
};

YAHOO.ELSA.addTermFromOnClickNoSubmit = function(p_oEvent, p_aArgs){
	YAHOO.ELSA.addQueryTerm(p_aArgs[0], p_aArgs[1], p_aArgs[2]);
}

YAHOO.ELSA.addQueryTerm = function(p_sClass, p_sField, p_sValue){
	logger.log('adding to current query class' + p_sClass + ', field:' + p_sField + ', val: ' + p_sValue);
	try {
		YAHOO.ELSA.currentQuery.addTerm(p_sClass + '.' + p_sField, p_sValue);
	} catch(e) { YAHOO.ELSA.Error(e); }
};

YAHOO.ELSA.addTermFromChart = function(p_iChartId, p_iIndex){
	logger.log('addTermFromChart p_iChartId', p_iChartId);
	logger.log('addTermFromChart p_iIndex', p_iIndex);
	logger.log('chart data: ', YAHOO.ELSA.Charts[p_iChartId]);
	var sField = YAHOO.ELSA.Charts[p_iChartId].cfg.elements[0].text;
	var oData = YAHOO.ELSA.Charts[p_iChartId].cfg.elements[0].values[p_iIndex];
	YAHOO.ELSA.currentQuery.delMeta('class');
	YAHOO.ELSA.currentQuery.delMeta('groupby');
	YAHOO.ELSA.currentQuery.delMeta('limit');
	YAHOO.ELSA.addTermAndSubmit(sField, oData);
}

YAHOO.ELSA.addTermFromOnClick = function(p_oEvent, p_aArgs){
	YAHOO.ELSA.addTermAndSubmit(p_aArgs[0], p_aArgs[1]);
}

YAHOO.ELSA.addTermAndSubmit = function(p_sField, p_oData){
	logger.log('p_oData', p_oData);
	var sData;
	if (typeof p_oData != 'object'){
		sData = p_oData;
	}
	else {
		sData = p_oData['label'];
	}
	logger.log('this', this);
	logger.log('type of ' + typeof this);
	var tmp = YAHOO.ELSA.currentQuery.queryBoolean;
	try {
		YAHOO.ELSA.currentQuery.queryBoolean = '+';
		YAHOO.ELSA.currentQuery.addTerm(p_sField, '"' + sData + '"', '=');
		YAHOO.ELSA.currentQuery.delMeta('class');
		YAHOO.ELSA.currentQuery.delMeta('groupby');
		YAHOO.ELSA.currentQuery.delMeta('limit');
		YAHOO.ELSA.currentQuery.submit();
	} catch(e) { YAHOO.ELSA.Error(e); }
	
	YAHOO.ELSA.currentQuery.queryBoolean = tmp;
	logger.log('submitted');
}
	

YAHOO.ELSA.groupData = function(p_iId, p_sClass, p_sField, p_sAggFunc){
	logger.log('p_iId', p_iId);
	logger.log('p_sClass', p_sClass);
	if (!YAHOO.ELSA.currentQuery){
		logger.log('no currentQuery');
		return;
	}
	
	// we might have gotten an array ref as args
	if (typeof p_iId == 'object'){
		var arr = p_sClass;
		p_iId = arr[0];
		p_sClass = arr[1];
		p_sField = arr[2];
		p_sAggFunc = arr[3];
	}
	
	// reset old values
	YAHOO.ELSA.currentQuery.delMeta('class');
	YAHOO.ELSA.currentQuery.delMeta('groupby');
	YAHOO.ELSA.currentQuery.delMeta('class');
	YAHOO.ELSA.currentQuery.delMeta('limit');
	
	if (!p_sClass){
		YAHOO.ELSA.currentQuery.addMeta('groupby', [p_sField]);
	}
	else if (p_sClass == 'any'){
		//any class, always an INT field
		YAHOO.ELSA.currentQuery.addMeta('class', 'any');
		YAHOO.ELSA.currentQuery.addMeta('groupby', [p_sField]);
	}
	else if (p_sClass != YAHOO.ELSA.Labels.noGroupBy){ //clears
		// Find type to determine if we can do this remotely or if it's a client-side group
		var sFieldType = 'string';
		for (var i in YAHOO.ELSA.formParams.fields){
			if (YAHOO.ELSA.formParams.fields[i].fqdn_field === p_sClass + '.' + p_sField){
				sFieldType = YAHOO.ELSA.formParams.fields[i].field_type;
				break;
			}
		}
		
		YAHOO.ELSA.currentQuery.addMeta('class', p_sClass);
		YAHOO.ELSA.currentQuery.addMeta('groupby', [p_sField]);
	}
	
	// create new groupby results
	var oResults = new YAHOO.ELSA.Results.Tabbed.Live(YAHOO.ELSA.tabView, YAHOO.ELSA.currentQuery);
	logger.log('got query results:', oResults);
	YAHOO.ELSA.currentQuery.resetTerms();
}

YAHOO.ELSA.sendLocalChartData = function(p_iId, p_sField, p_sAggFunc){
	if (!YAHOO.ELSA.localResults[p_iId]){
		YAHOO.ELSA.Error('No results for id ' + p_iId);
		return;
	}
	
	var aData = [];
	for (var i in YAHOO.ELSA.localResults[p_iId].results.results){
		var rec = {};
		for (var j in YAHOO.ELSA.localResults[p_iId].results.results[i]._fields){
			logger.log('matching ' + YAHOO.ELSA.localResults[p_iId].results.results[i]._fields[j].field + ' against ' + p_sField);
			if (YAHOO.ELSA.localResults[p_iId].results.results[i]._fields[j].field == p_sField){
				rec[p_sField] = YAHOO.ELSA.localResults[p_iId].results.results[i]._fields[j].value;
			}
		}
		if (keys(rec).length){
			aData.push(rec);
		}
	}
	logger.log('results:', aData);
	
	if (!p_sAggFunc){
		var sSampleVal = aData[0][p_sField];
		if (sSampleVal.match(/^\d+$/)){
			p_sAggFunc = 'SUM';
		}
		else {
			p_sAggFunc = 'COUNT';
		}
	}
	var sendData = {
		data: aData,
		func: p_sAggFunc 
	};

	var callback = {
		success: function(p_oResponse){
			oSelf = p_oResponse.argument[0];
			if(p_oResponse.responseText !== undefined && p_oResponse.responseText){
				logger.log('rawResponse: ' + p_oResponse.responseText);
				try{
					var oRawChartData = YAHOO.lang.JSON.parse(p_oResponse.responseText);
					logger.log('oRawChartData', oRawChartData);
					var divId = 'chart';
					var oChart = new YAHOO.ELSA.Chart.Auto({ container:divId, type:'line', title:p_sField, data:oRawChartData});
				}catch(e){
					logger.log('Could not parse response for chart parameters because of an error: '+e);
					return false;
				}				
			}
			else {
				YAHOO.ELSA.Error('Did not receive chart params');
				return false;
			}
		},
		failure: function(oResponse){
			YAHOO.ELSA.Error('Error creating chart.');
		},
		argument: [this]
	};
	
	logger.log('sending: ', 'data=' + YAHOO.lang.JSON.stringify(sendData));
	var oConn = YAHOO.util.Connect.asyncRequest('POST', 'Chart/json', callback, 
		'data=' + encodeURIComponent(YAHOO.lang.JSON.stringify(sendData)));
}

YAHOO.ELSA.Results = function(){
	
	logger.log('before push: ', YAHOO.ELSA.localResults);
	YAHOO.ELSA.localResults.push(this);
	YAHOO.ELSA.queryResultCounter++;
	this.id = YAHOO.ELSA.queryResultCounter;
	logger.log('my id: ' + this.id);
	
	var oSelf = this;
	
	this.formatFields = function(p_elCell, oRecord, oColumn, p_oData){
		//logger.log('called formatFields on ', oRecord);
		try {
			var msgDiv = document.createElement('div');
			msgDiv.setAttribute('class', 'msg');
			var msg = cloneVar(oRecord.getData().msg);
			var re;
			
			if (oSelf.results.highlights){
				//apply highlights
				for (var sHighlight in oSelf.results.highlights){
					sHighlight = sHighlight.replace(/^["']*/, '');
					sHighlight = sHighlight.replace(/["']*$/, '');
					logger.log('sHighlight '  + sHighlight);
					re = new RegExp('(' + sHighlight + ')', 'ig');
					var aMatches = msg.match(re);
					if (aMatches != null){
						var sReplacement = '<span class=\'highlight\'>' + escapeHTML(aMatches[0]) + '</span>';
						msg = msg.replace(re, sReplacement);
					}
				}
			}
			msgDiv.innerHTML = msg;
			p_elCell.appendChild(msgDiv);
			
			var oDiv = document.createElement('div');
			var oTempWorkingSet = cloneVar(p_oData);
			
			for (var i in oTempWorkingSet){
				var fieldHash = oTempWorkingSet[i];
				var aMatches = null;
				if (fieldHash.value != null){
					aMatches = fieldHash.value.match(re);
				}
				if (aMatches != null){
					var sReplacement = '<span class=\'highlight\'>' + escapeHTML(aMatches[0]) + '</span>';
					fieldHash.value_with_markup = fieldHash.value.replace(re, sReplacement);
				}
				else if (fieldHash.value != ''){
					fieldHash.value_with_markup = escapeHTML(fieldHash.value);
				}
				//logger.log('fieldHash', fieldHash);
				
				// create chart link
				var oGraphA = document.createElement('a');
				oGraphA.innerHTML = fieldHash['field'];
				oGraphA.setAttribute('href', '#');
				oGraphA.setAttribute('class', 'key');
				oDiv.appendChild(oGraphA);
				var oElGraphA = new YAHOO.util.Element(oGraphA);
				oElGraphA.on('click', YAHOO.ELSA.groupData, [ YAHOO.ELSA.getLocalResultId(oSelf.tab), fieldHash['class'], fieldHash['field'] ], this);
				
				// create drill-down item link
				var a = document.createElement('a');
				a.id = oRecord.getData().id + '_' + fieldHash['field'];
				
				a.setAttribute('href', '#');//Will jump to the top of page. Could be annoying
				a.setAttribute('class', 'value');
				
				if (oSelf.results.highlights){
					for (var sHighlight in oSelf.results.highlights){
						sHighlight = sHighlight.replace(/^["']*/, '');
						sHighlight = sHighlight.replace(/["']*$/, '');
						var re = new RegExp('(' + sHighlight + ')', 'ig');
						//logger.log('str: ' + fieldHash['value_with_markup'] + ', re:' + re.toString());
						if (fieldHash['value_with_markup']){
							var re = new RegExp('(' + RegExp.escape(sHighlight) + ')', 'ig');
							var aMatches = msg.match(re);
							if (aMatches != null){
								var sReplacement = '<span class=\'highlight\'>' + escapeHTML(aMatches[0]) + '</span>';
								fieldHash['value_with_markup'] = fieldHash['value_with_markup'].replace(re, sReplacement);
							}
						}
						else {
							fieldHash['value_with_markup'] = '';
						}
					}
				}
				
				a.innerHTML = fieldHash['value_with_markup'];
				
				oDiv.appendChild(document.createTextNode('='));
				oDiv.appendChild(a);
				
				var oAEl = new YAHOO.util.Element(a);
				oAEl.on('click', YAHOO.ELSA.addTermFromOnClickNoSubmit, [fieldHash['class'], fieldHash['field'], fieldHash['value']]);
				oDiv.appendChild(document.createTextNode(' '));
			}
			p_elCell.appendChild(oDiv);
		}
		catch (e){
			logger.log('exception while parsing field:', e);
			return '';
		}
	}
	
//	this.formatAddHighlights = function(p_elCell, oRecord, oColumn, p_oData){
//		var sText = p_oData;
//		for (var sHighlight in oSelf.highlights){
//			var re = new RegExp('(' + RegExp.escape(sHighlight) + ')', 'ig');
//			sText = sText.replace(re, '<span class="highlight">$1</span>');
//		}
//		p_elCell.innerHTML = sText;
//	}
	
	this.formatDate = function(p_elCell, oRecord, oColumn, p_oData)
	{
		var oDate = p_oData;
		if(p_oData instanceof Date){
			oDate = p_oData;
		}else{
			var mSec = getDateFromISO(p_oData);
			oDate = new Date();
			oDate.setTime(mSec);
		}
		var curDate = new Date();
		// only display the year if it isn't the current year
		if (curDate.getYear() != oDate.getYear()){
			p_elCell.innerHTML = sprintf('%04d %s %s %02d %02d:%02d:%02d',
				oDate.getYear() + 1900,
				YAHOO.ELSA.TimeTranslation.Days[ oDate.getDay() ],
				YAHOO.ELSA.TimeTranslation.Months[ oDate.getMonth() ],
				oDate.getDate(),
				oDate.getHours(),
				oDate.getMinutes(),
				oDate.getSeconds()
			);
		}
		else {
			p_elCell.innerHTML = sprintf('%s %s %02d %02d:%02d:%02d',
				YAHOO.ELSA.TimeTranslation.Days[ oDate.getDay() ],
				YAHOO.ELSA.TimeTranslation.Months[ oDate.getMonth() ],
				oDate.getDate(),
				oDate.getHours(),
				oDate.getMinutes(),
				oDate.getSeconds()
			);
		}
	};
	
	this.formatInfoButton = function(p_elCell, p_oRecord, p_oColumn, p_oData){
		//logger.log('p_oRecord.getData()', p_oRecord.getData());
		try {
			var oA = document.createElement('a');
			oA.href = '#';
			oA.id = 'button_' + oSelf.id + '_' + p_oRecord.getId();
			oA.name = 'button_' + p_oRecord.getId();
			oA.innerHTML = 'Info';
			p_elCell.appendChild(oA);
			var oAEl = new YAHOO.util.Element(oA);
			oAEl.addClass('infoButton');
			oAEl.subscribe('click', YAHOO.ELSA.getInfo, p_oRecord);
		}
		catch (e){
			var str = '';
			for (var i in e){
				str += i + ' ' + e[i];
			}
			YAHOO.ELSA.Error('Error creating button: ' + str);
		}
	}
	
	this.send =  function(p_sPlugin, p_sUrl){ 
		YAHOO.ELSA.send(p_sPlugin, p_sUrl, this.results.results);
	}
	
	this.save = function(p_sComment){
		//logger.log('saveResults', this);
		if (!this.results){
			throw new Error('No results to save');
		}
		
		var callback = {
			success: function(oResponse){
				oSelf = oResponse.argument[0];
				if (oResponse.responseText){
					var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
					if (typeof oReturn === 'object'){
						YAHOO.ELSA.Error(oReturn['error']);
					}
					else if (oReturn == 1) {
						logger.log('result saved successfully');
						var lbl = '';
						lbl = oSelf.tab.get('label');
						lbl = '(Saved to QID ' + oSelf.id + ') ' + lbl;
						oSelf.tab.set('label', lbl);
					}
					else {
						logger.log(oReturn);
						YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
					}
				}
				else {
					YAHOO.ELSA.Error('No response text');
				}
			},
			failure: function(oResponse){
				YAHOO.ELSA.Error('Error saving result.');
			},
			argument: [this]
		};
		
		var closeDialog = function(){
			var eD = YAHOO.util.Dom.get('exportDialog');
			eD.parentNode.removeChild(eD);
		}

		logger.log('sending: ', 'comments=' + p_sComment + '&results=' + YAHOO.lang.JSON.stringify(this.results));
		var oConn = YAHOO.util.Connect.asyncRequest('POST', 'Query/save_results', callback, 
			'comments=' + p_sComment + '&results=' + encodeURIComponent(YAHOO.lang.JSON.stringify(this.results)));
	};
	
	this.formatExtraColumn = function(p_elCell, p_oRecord, p_oColumn, p_oData){
		var a = document.createElement('a');
		a.id = p_oRecord.getData().id + '_' + p_oColumn.getKey();
		
		a.setAttribute('href', '#');//Will jump to the top of page. Could be annoying
		a.setAttribute('class', 'value');
		a.innerHTML = p_oData;
		
		// Special case for logs coming from localhost to show the node value instead
		if (p_oColumn.getKey() == 'host' && p_oData == '127.0.0.1'){
			a.innerHTML = p_oRecord.getData().node;
		}
				
		p_elCell.appendChild(a);
		
		var oAEl = new YAHOO.util.Element(a);
		oAEl.on('click', YAHOO.ELSA.addTermFromOnClickNoSubmit, ['NONE', p_oColumn.getKey(), a.innerHTML]);
	}
	
	this.createDataTable = function(p_oResults, p_oElContainer){
		var oFields = [
			{ key:'id', parser:parseInt },
			{ key:'node' }, // not displayed
			{ key:'timestamp', parser:YAHOO.util.DataSourceBase.parseDate },
			{ key:'host', parser:YAHOO.util.DataSourceBase.parseString },
			{ key:'class', parser:YAHOO.util.DataSourceBase.parseString },
			{ key:'program', parser:YAHOO.util.DataSourceBase.parseString },
			{ key:'_fields' },
			{ key:'msg', parser: escapeHTML }
		];
		
		var oColumns = [
			{ key:'info', label:'', sortable:true, formatter:this.formatInfoButton }
		];
		
		for (var i in YAHOO.ELSA.formParams.additional_display_columns){
			var sCol = YAHOO.ELSA.formParams.additional_display_columns[i];
			oColumns.push({ key:sCol, label:sCol, sortable:true, formatter:this.formatExtraColumn });
		}
		
		oColumns.push({ key:'timestamp', label:'Timestamp', sortable:true, editor:'date', formatter:this.formatDate });
		oColumns.push({ key:'_fields', label:'Fields', sortable:true, formatter:this.formatFields }); //formatter adds highlights
		
		// DataSource instance
	    this.dataSource = new YAHOO.util.DataSource(p_oResults);
	    this.dataSource.maxCacheEntries = 4; //cache these
	    this.dataSource.responseType = YAHOO.util.DataSource.TYPE_JSON;
	    this.dataSource.responseSchema = {
	        resultsList: 'results',
	        fields: oFields,
	        metaFields: {
	            totalRecords: 'totalRecords', // Access to value in the server response
	            recordsReturned: 'recordsReturned',
	            startIndex: 'startIndex'
	        }
	    };
	    
	    this.paginator = new YAHOO.widget.Paginator({
	        pageLinks          : 10,
	        rowsPerPage        : 15,
	        rowsPerPageOptions : [15,50,100],
	        template           : '{CurrentPageReport} {PreviousPageLink} {PageLinks} {NextPageLink} {RowsPerPageDropdown}',
	        pageReportTemplate : '<strong>Records: {totalRecords} / ' + this.dataSource.liveData.totalRecords + ' </strong> '
	        	+ this.dataSource.liveData.totalTime + ' ms '
	    });
	    
	    var oTableCfg = {
	        paginator: this.paginator,
	        dynamicData: false,
	        summary: 'this is a summary'
	    };
	    
	    try{
	    	logger.log('About to create DT with ', "dt" + p_oElContainer, oColumns, this.dataSource, oTableCfg);
	    	this.dataTable = new YAHOO.widget.DataTable(p_oElContainer, oColumns, this.dataSource, oTableCfg);
	    	logger.log('datatable: ', this.dataTable);
	  	 	YAHOO.util.Dom.removeClass(p_oElContainer, 'hiddenElement');
	    }catch(e){
	    	logger.log('No datatable because:', e);
	    	for (var term in e){
				logger.log(term, e[term]);
			}
	    	return;
	    }
	}
	
	this.createGroupByDataTable = function(p_oGroupBy, p_sGroupBy, p_oElContainer){
		if (!this.groupByDataTables){
			this.groupByDataTables = {};
		}
		logger.log('p_oGroupBy', p_oGroupBy);
		logger.log('p_sGroupBy', p_sGroupBy);
		var oGroupData = p_oGroupBy;
		logger.log('oGroupData', oGroupData);
		
		// create data formatted for chart
		var aX = [];
		var aY = [];
		for (var i in oGroupData){
			var oRec = oGroupData[i];
			aX.push(oRec['@groupby']);
			aY.push(oRec['@count']);
		}
		var oChartData = {
			x: aX
		};
		oChartData[p_sGroupBy] = aY;
		logger.log('oChartData:', oChartData);
		this.chartData = oChartData;
		
		// create data table data
		var aExportData = [];
		for (var i = 0; i < oGroupData.length; i++){
			oGroupData[i]['count'] = oGroupData[i]['@count'];
			oGroupData[i]['groupby'] = oGroupData[i]['@groupby'];
			aExportData.push({count:oGroupData[i]['@count'], groupby:oGroupData[i]['@groupby']});
		}
		
		// Create a container for the button
		var buttonEl = document.createElement('div');
		buttonEl.id = 'groupby_button_' + this.id + '_' + p_sGroupBy;
		p_oElContainer.appendChild(buttonEl);
		
		// Create the export button
		var oMenuSources = [ 
			{text:'Save Results', value:'saveResults', onclick: { fn: YAHOO.ELSA.saveResults, obj:this.id }},
			{text:'Export Results', value:'exportResults', onclick: { fn: YAHOO.ELSA.exportData, obj:aExportData }},
			{text:'Add to Dashboard...', value:'addToDashboard', onclick:{ fn:YAHOO.ELSA.addQueryToChart}}
		];
		
		var oMenuButtonCfg = {
			type: 'menu',
			label: 'Result Options...',
			name: 'result_options_select_button',
			menu: oMenuSources,
			container: buttonEl
		};
		var oButton = new YAHOO.widget.Button(oMenuButtonCfg);
		
		// create div to hold both datatable and grid
		var bothDiv = document.createElement('div');
		p_oElContainer.appendChild(bothDiv);
		
		// Create a container for the datatable
		var dtEl = document.createElement('div');
		dtEl.id = 'groupby_datatable_' + this.id + '_' + p_sGroupBy;
		var oEl = new YAHOO.util.Element(dtEl);
		oEl.setStyle('float', 'left');
		bothDiv.appendChild(dtEl);
		
		// create a div for the chart and create it with the local data
		var oChartEl = document.createElement('div');
		oChartEl.id = 'groupby_chart_' + this.id + '_' + p_sGroupBy;
		oEl = new YAHOO.util.Element(oChartEl);
		oEl.setStyle('float', 'left');
		bothDiv.appendChild(oChartEl);
		logger.log('p_oElContainer: ' + p_oElContainer.innerHTML);
		var sTitle;
		if (this.tab){
			sTitle = this.tab.get('labelEl').innerText;
		}
		else {
			sTitle = p_sGroupBy;
		}
		var oChart = new YAHOO.ELSA.Chart.Auto({container:oChartEl.id, type:'bar', title:sTitle, data:this.chartData, callback:YAHOO.ELSA.addTermFromChart});
		
		var formatValue = function(p_elCell, oRecord, oColumn, p_oData){
			var a = document.createElement('a');
			a.setAttribute('href', '#');
			a.innerHTML = p_oData;
			var el = new YAHOO.util.Element(a);
			el.on('click', YAHOO.ELSA.addTermFromOnClick, [p_sGroupBy, p_oData], YAHOO.ELSA.currentQuery);
			p_elCell.appendChild(a);
		}
		
		var oFields = [
			{ key:'count', parser:YAHOO.util.DataSourceBase.parseNumber },
			{ key:'groupby', parser:YAHOO.util.DataSourceBase.parseString }
		];
		
		var oColumns = [
			{ key:'count', label:'Count', sortable:true },
			{ key:'groupby', label:'Value', formatter:formatValue, sortable:true }
		];
		
		// DataSource instance
	    var dataSource = new YAHOO.util.DataSource(p_oGroupBy);
	    dataSource.maxCacheEntries = 4; //cache these
		dataSource.responseType = YAHOO.util.DataSource.TYPE_JSARRAY;
		dataSource.responseSchema = {
	        fields: oFields
	    };
	    
	    var oTableCfg = { };
	    try{
	    	logger.log('About to create DT with ', dtEl, oColumns, dataSource, oTableCfg);
	    	this.groupByDataTables[p_sGroupBy] = new YAHOO.widget.DataTable(dtEl, oColumns, dataSource, oTableCfg);
	  	 	logger.log('groupby datatable: ', this.groupByDataTables[p_sGroupBy]);
	  	 	YAHOO.util.Dom.removeClass(dtEl, 'hiddenElement');
	    }catch(e){
	    	logger.log('No datatable because:', e);
	    	for (var term in e){
				logger.log(term, e[term]);
			}
	    	return;
	    }
	}
};

YAHOO.ELSA.Results.Given = function(p_oResults){
	this.superClass = YAHOO.ELSA.Results;
	this.superClass();
	this.results = p_oResults;
	
	this.formatFields = function(p_elCell, oRecord, oColumn, p_oData){
		//logger.log('called formatFields on ', oRecord);
		try {
			var msgDiv = document.createElement('div');
			msgDiv.setAttribute('class', 'msg');
			var msg = cloneVar(oRecord.getData().msg);
			msgDiv.innerHTML = msg;
			p_elCell.appendChild(msgDiv);
			
			var oDiv = document.createElement('div');
			var oTempWorkingSet = cloneVar(p_oData);
			
			for (var i in oTempWorkingSet){
				var fieldHash = oTempWorkingSet[i];
				fieldHash.value_with_markup = escapeHTML(fieldHash.value);
				//logger.log('fieldHash', fieldHash);
				
				// create field text
				var oText = document.createTextNode(fieldHash['field'] + '=' + fieldHash['value'] + ' ');
				oDiv.appendChild(oText);
			}
			p_elCell.appendChild(oDiv);
		}
		catch (e){
			logger.log('exception while parsing field:', e);
			return '';
		}
	}
	
	var oDiv = document.createElement('div');
	oDiv.id = 'given_results';
	YAHOO.util.Dom.get('logs').appendChild(oDiv);
	
	if (p_oResults.query_meta_params && p_oResults.query_meta_params.groupby){
		for (var i in p_oResults.query_meta_params.groupby){
			var sGroupBy = p_oResults.query_meta_params.groupby[i];
			this.createGroupByDataTable(p_oResults.results[sGroupBy], sGroupBy, oDiv);
		}
	}
	else {
		this.createDataTable(p_oResults, oDiv);
		this.dataTable.render();
	}
}
	
YAHOO.ELSA.Form = function(p_oFormEl, p_oFormCfg){
	this.form = p_oFormEl;
	this.grid = p_oFormCfg['grid'];
	
	var oTable = document.createElement('table');
	var oTbody = document.createElement('tbody'); //tbody is critical for proper IE appendChild
	
	/* First, find the max width of the grid */
	var iMaxWidth = 0;
	for (var i = 0; i < this.grid.length; i++){
		if (this.grid[i].length > iMaxWidth){
			iMaxWidth = this.grid[i].length;
		}
	}
	
	for (var attr in p_oFormCfg['form_attrs']){
		this.form.setAttribute(attr, p_oFormCfg['form_attrs'][attr]);
	}
	for (var i = 0; i < this.grid.length; i++){
		var iColspan = 0;
		if (this.grid[i].length < iMaxWidth){
			iColspan = iMaxWidth - this.grid[i].length + 1;
		}
		var oTrEl = document.createElement('tr');
		for (var j = 0; j < this.grid[i].length; j++){
			var oTdEl = document.createElement('td');
			/* Adjust iColspan if necessary */
			if (iColspan > 0 && j == (this.grid[i].length - 1)){
				oTdEl.setAttribute('colspan', iColspan);
			}
			
			//Check to see if this is yet another array, and if it is, we'll concat all the objects to make the td
			if (this.grid[i][j].type){
				this.appendItem(oTdEl, this.grid[i][j]);
			}
			else {
				//Must be an array
				for (var k = 0; k < this.grid[i][j].length; k++){
					this.appendItem(oTdEl, this.grid[i][j][k]);
				}
			}
			oTrEl.appendChild(oTdEl);
		}
		oTbody.appendChild(oTrEl);
	}
	oTable.appendChild(oTbody);
	this.form.appendChild(oTable);
	
	this.validate = function(){
		for (var i = 0; i < this.grid.length; i++){
			for (var j = 0; j < this.grid[i].length; j++){
				if (this.grid[i][j].regex){
					var oFormInput = this.grid[i][j];
					var id = oFormInput.args.id;
					logger.log('regex: ' + oFormInput.regex);
					var oInputEl = YAHOO.util.Dom.get(id);
					logger.log('oInputEl:', oInputEl);
					logger.log('value:', oInputEl.value);
					if (oInputEl && oInputEl.value && !oFormInput.regex.test(oInputEl.value)){
						var oEl = new YAHOO.util.Element(id);
						oEl.addClass('invalid');
						return false;
					}
				}
			}
		}
		return true;
	}
	
	this.getValues = function(){
		var oValues = {};
		for (var i = 0; i < this.grid.length; i++){
			for (var j = 0; j < this.grid[i].length; j++){
				if (this.grid[i][j].args && this.grid[i][j].args.id){
					var id = this.grid[i][j].args.id;
					var oInputEl = YAHOO.util.Dom.get(id);
					if (oInputEl.value){
						oValues[id] = oInputEl.value;
					}
				}
			}
		}
		return oValues;
	}
	
	return this;
};

YAHOO.ELSA.Form.prototype.appendItem = function(p_oEl, p_oArgs){
	if (p_oArgs.type == 'text'){
		var oTextNode = document.createTextNode(p_oArgs.args);
		p_oEl.appendChild(oTextNode);
	}
	else if (p_oArgs.type == 'widget') {
		logger.log('p_oArgs', p_oArgs);
		if (typeof p_oArgs.args.container == 'undefined'){
			/* Set the container for the Button to be this td element */
			p_oArgs.args.container = p_oEl;
		}
		/* Dynamically create the widget object with an eval */
		var sClassName = 'YAHOO.widget.' + p_oArgs.className;
		var form_part;
		eval ('form_part = new ' + sClassName + ' (p_oArgs.args);');
		logger.log('form_part', form_part);
		if (p_oArgs.callback){
			p_oArgs.callback(p_oArgs, form_part, p_oEl);
		}
		// register with overlay manager if a menu
//		if (sClassName === 'Menu'){
//			YAHOO.ELSA.overlayManager.register(form_part);
//		}
		
//		if (p_oArgs.args.type === 'menu'){
//			if (p_oArgs.args.setDefault){
//				logger.log('form_part', form_part);
//				form_part.getMenu().setInitialSelection();
//			}
//		}
		//YUI does the appendChild() for us in the widget construction so we don't have to...
	}
	else if (p_oArgs.type == 'input'){
		var oInputEl = document.createElement('input');
		for (var arg in p_oArgs.args){
			oInputEl[arg] = p_oArgs.args[arg];
		}
		p_oEl.appendChild(oInputEl);
		if (p_oArgs.args.label){
			var elText = document.createElement('label');
			elText.innerHTML = p_oArgs.args.label;
			elText['for'] = p_oArgs.args.id;
			p_oEl.appendChild(elText);
		}
		if (p_oArgs.callback){
			p_oArgs.callback(p_oArgs, oInputEl, p_oEl);
		}
	}
	else if (p_oArgs.type == 'element'){
		logger.log('element args:', p_oArgs);
		var oEl = document.createElement(p_oArgs.element);
		for (var arg in p_oArgs.args){
			oEl[arg] = p_oArgs.args[arg];
		}
		p_oEl.appendChild(oEl);
	}
	else {
		throw 'Unknown grid type: ' + p_oArgs.type;
	}
};

YAHOO.ELSA.Query.Scheduled = function(p_oRecord){
	logger.log('building scheduled query with oRecord:', p_oRecord);
	var data = p_oRecord.getData();
	this.superClass = YAHOO.ELSA.Query;
	this.superClass();
	this.scheduleId = parseInt(data.id);
	this.query = data.query;
	this.interval = data.interval;
	this.start = data.start;
	this.end = data.end;
	this.action = data.action;
	this.action_params = data.action_params;
	this.enabled = data.enabled;
	this.recordSetId = YAHOO.ELSA.getQuerySchedule.dataTable.getRecordSet().getRecordIndex(p_oRecord);
	
	this.set = function(p_sProperty, p_oNewValue){
		this[p_sProperty] = p_oNewValue; // set
		
		// sync to server
		var callback = {
			success: function(oResponse){
				oSelf = oResponse.argument[0];
				if (oResponse.responseText){
					var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
					if (typeof oReturn === 'object'){
						if (oReturn['error']){
							YAHOO.ELSA.Error(oReturn['error']);
							YAHOO.ELSA.getQuerySchedule.asyncSubmitterCallback();
						}
						else {
							logger.log('updated successfully, return:',oReturn);
							for (var arg in oReturn){
								YAHOO.ELSA.getQuerySchedule.asyncSubmitterCallback(true, oReturn[arg]);
							}
						}
					}
					else {
						logger.log(oReturn);
						YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
						YAHOO.ELSA.getQuerySchedule.asyncSubmitterCallback();
					}
				}
				else {
					YAHOO.ELSA.Error('No response text');
					YAHOO.ELSA.getQuerySchedule.asyncSubmitterCallback();
				}
			},
			failure: function(oResponse){
				YAHOO.ELSA.Error('Error saving result.');
				return [ false, ''];
			},
			argument: [this]
		};
		var str = this[p_sProperty];
		if (typeof str == 'object'){
			str = YAHOO.lang.JSON.stringify(str);
		}
		var oConn = YAHOO.util.Connect.asyncRequest('POST', 'Query/update_scheduled_query', callback,
			'id=' + this.scheduleId + '&' +  p_sProperty + '=' + encodeURIComponent(str));
	};
	
	this.remove = function(){
		var removeCallback = {
			success: function(oResponse){
				oSelf = oResponse.argument[0];
				if (oResponse.responseText){
					var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
					if (typeof oReturn === 'object'){
						if (oReturn['error']){
							YAHOO.ELSA.Error(oReturn['error']);
						}
						else {
							logger.log('deleted query ' + oSelf.scheduleId);
							// find the row in the data table and delete it
							YAHOO.ELSA.getQuerySchedule.dropRow(oSelf.recordSetId);
							YAHOO.ELSA.localResults[oSelf.id] = null;
						}
					}
					else {
						logger.log(oReturn);
						YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
					}
				}
				else {
					YAHOO.ELSA.Error('No response text');
				}
			},
			failure: function(oResponse){ YAHOO.ELSA.Error('Error deleting scheduled query ' + this.scheduleId); },
			argument: [this]
		};
		var oConn = YAHOO.util.Connect.asyncRequest('POST', 'Query/delete_scheduled_query', removeCallback,
			'id=' + this.scheduleId);
	}
};

YAHOO.ELSA.Results.Saved = function(p_iQid){
	logger.log('building saved results with p_iQid:', p_iQid);
	this.superClass = YAHOO.ELSA.Results;
	this.qid = p_iQid;
	
	this.receiveResponse = function(oResponse){
		logger.log('response: ');
		if (oResponse.responseText){
			var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
			logger.log('oReturn:', oReturn);
			if (typeof oReturn === 'object' && oReturn['error']){
				YAHOO.ELSA.Error(oReturn['error']);
			}
			else if (oReturn){
				//oQuery is this from the current scope
				var oSelf = oResponse.argument[0];
				for (var key in oReturn){
					try {
						oSelf[key] = YAHOO.lang.JSON.parse(oReturn[key]);
					}
					catch (e){
						logger.log('key ' + key + ' threw ' + e);
						oSelf[key] = oReturn[key];
					}
				}
			}
			else {
				logger.log(oReturn);
				YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
			}
		}
		else {
			YAHOO.ELSA.Error('No response text');
		}
	};
	
	this.remove = function(){
		var removeCallback = {
			success: function(oResponse){
				oSelf = oResponse.argument[0];
				if (oResponse.responseText){
					var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
					if (typeof oReturn === 'object'){
						if (oReturn['error']){
							YAHOO.ELSA.Error(oReturn['error']);
						}
						else {
							logger.log('deleted query ' + oSelf.qid);
							// find the row in the data table and delete it
							for (var i = 0; i < YAHOO.ELSA.getSavedQueries.dataTable.getRecordSet().getLength(); i++){
								var oRecord = YAHOO.ELSA.getSavedQueries.dataTable.getRecordSet().getRecord(i);
								if (!oRecord){
									continue;
								}
								if (oRecord.getData().qid == oSelf.qid){
									logger.log('removing record ' + oRecord.getId() + ' from datatable');
									YAHOO.ELSA.getSavedQueries.dataTable.deleteRow(oRecord.getId());
									break;
								}
							}
						}
					}
					else {
						logger.log(oReturn);
						YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
					}
				}
				else {
					YAHOO.ELSA.Error('No response text');
				}
			},
			failure: function(oResponse){ YAHOO.ELSA.Error('Error deleting saved query ' + this.qid); },
			argument: [this]
		};
		var oConn = YAHOO.util.Connect.asyncRequest('POST', 'Query/delete_saved_results', removeCallback,
			'qid=' + this.qid);
	};
	
	// Get the saved query data from the server
	var request = YAHOO.util.Connect.asyncRequest('GET', 
			'Query/get_saved_queries?qid=' + p_iQid,
			{ 
				success: this.receiveResponse,
				failure:function(oResponse){
					YAHOO.ELSA.Error('Query failed!'); return false;
				},
				argument: [this]
			}
	);
	
	
};

YAHOO.ELSA.Results.Tabbed = function(p_oTabView, p_sQueryString, p_sTabLabel){
	this.superClass = YAHOO.ELSA.Results;
	this.superClass();
	
	this.queryString = p_sQueryString; 
	
//	// Create the search highlight terms
//	var aQueryWords = p_sQueryString.split(/\s+/);
//	for (var i in aQueryWords){
//		if (!aQueryWords[i]){
//			continue;
//		}
//		
//		aQueryWords[i] = aQueryWords[i].replace(/[^a-zA-Z0-9\.\-\@\_\:\=\>\<]/g, ''); //strip non-alpha-num
//		var aHighlightTerms = aQueryWords[i].split(/[=<>:]+/);
//		logger.log('aHighlightTerms', aHighlightTerms);
//		if (aHighlightTerms.length == 1){
//			if (aHighlightTerms[0]){
//				this.highlights[ aHighlightTerms[0] ] = 1;
//			}
//		}
//		else if (aHighlightTerms.length == 2){
//			if (aHighlightTerms[1]){
//				this.highlights[ aHighlightTerms[1] ] = 1;
//			}
//		}
//	}
	
	this.tabView = p_oTabView;
	YAHOO.util.Dom.removeClass(this.tabView, 'hiddenElement');
	this.tab = new YAHOO.widget.Tab();
		
	var oLabelEl = new YAHOO.util.Element(this.tab.get('labelEl'));
	oLabelEl.addClass('yui-panel');
	
	logger.log('tab: ', this.tab);
	try {
		this.tabView.addTab(this.tab);
		this.tabId = this.tabView.getTabIndex(this.tab);
		this.tab.get('labelEl').innerHTML = 
			'<table id="' + this.id + '" style="padding: 0px;"><tr><td class="yui-skin-sam">' + p_sTabLabel + '</td>' +
			'<td id="close_box_' + this.id + '" class="yui-skin-sam loading"></td></tr></table>';
		var oElClose = new YAHOO.util.Element(YAHOO.util.Dom.get('close_box_' + this.id));
		oElClose.removeClass('hiddenElement');
		
		this.closeTab = function(p_oEvent){
			logger.log('closing tab: ', this);
			YAHOO.util.Event.stopEvent(p_oEvent);
			// find the localResults associated and remove them
			logger.log('removing tab with tabid: ' + this.tabId);
			var iLocalResultId = YAHOO.ELSA.getLocalResultId(this.tab);
			YAHOO.ELSA.localResults.splice(iLocalResultId, 1);
			this.tabView.deselectTab(this.tabId);
			this.tabView.removeTab(this.tab);
			YAHOO.ELSA.updateTabIds(this.tabId);
			this.tabId = '';
			this.tab = '';
		}
		
		// Create a div we'll attach the results menu button to later
		var oEl = document.createElement('div');
		oEl.id = 'query_export_' + this.id;
		this.tab.get('contentEl').appendChild(oEl);
		oElClose.addListener('click', this.closeTab, this, true);
		
		var oActiveTab = p_oTabView.get('activeTab');
		var iActiveTabId = this.tabView.getTabIndex(oActiveTab);
		if (YAHOO.util.Dom.get('same_tab_checkbox').checked && oActiveTab){
			logger.log('removing tab with tabid: ' + iActiveTabId);
			var iLocalResultId = YAHOO.ELSA.getLocalResultId(oActiveTab);
			YAHOO.ELSA.localResults.splice(iLocalResultId, 1);
			this.tabView.deselectTab(iActiveTabId);
			this.tabView.removeTab(oActiveTab);
			YAHOO.ELSA.updateTabIds(iActiveTabId);
		}
		
		
	} catch (e){ logger.log(e) }
	
	this.loadResponse = function(p_oResults){
		logger.log('got results:', p_oResults);
		try {
			this.results = p_oResults;
			var oElClose = new YAHOO.util.Element(YAHOO.util.Dom.get('close_box_' + this.id));
			oElClose.removeClass('loading');
			oElClose.addClass('close');
			var oLabelEl = this.tab.get('labelEl').getElementsByTagName('td')[0];
			
			if (this.results.qid){
				this.qid = this.results.qid;
			}
			else {
				YAHOO.ELSA.Error('no qid found in results');
			}
		
			if (this.results.batch){
				oLabelEl.innerHTML += ' [batched]';
			}
			else {
				oLabelEl.innerHTML += ' (' + this.results.totalRecords + ')';
		    	if (p_oResults.query_string){ //saved result
			    	this.sentQuery = YAHOO.lang.JSON.stringify({
						query_string: this.results.query_string, 
						query_meta_params: this.results.query_meta_params
					});
		    	}
			}
		}
		catch (e){
			YAHOO.ELSA.Error('Error loading response' + e);
		}
		
		if (this.results.batch){
			var oEl = document.createElement('h3');
			oEl.innerHTML = 'Query ' + this.qid + ' submitted.  ' +
				this.results.batch_message + '<br>';
			this.tab.get('contentEl').appendChild(oEl);
			var aEl = document.createElement('a');
			aEl.innerHTML = 'Cancel Query';
			aEl.href = '#';
			this.tab.get('contentEl').appendChild(aEl);
			var oEl = new YAHOO.util.Element(aEl);
			oEl.on('click', YAHOO.ELSA.cancelQuery, [this.results.batch], this);
		}
		else if (this.results.groupby && this.results.groupby.length){
			oLabelEl.innerHTML += ' [Grouped by ' + this.results.groupby.join(',') + ']';
			try {
				for (var i in this.results.groupby){
					var sGroupBy = this.results.groupby[i];
					this.createGroupByDataTable(this.results.results[sGroupBy], sGroupBy, this.tab.get('contentEl'));
					this.groupByDataTables[sGroupBy].render();				
					this.groupByDataTables[sGroupBy].sortColumn(
						this.groupByDataTables[sGroupBy].getColumn('count'), 
						YAHOO.widget.DataTable.CLASS_DESC);
				}
			}
			catch (e){
				logger.log('Datatable render failed because:', e.stack);
			}
		}
		else if (typeof(this.results.query_meta_params) != 'undefined' && 
			typeof(this.results.query_meta_params.groupby) != 'undefined' && 
			this.results.query_meta_params.groupby.length){
			oLabelEl.innerHTML += ' [Grouped by ' + this.results.query_meta_params.groupby.join(',') + ']';
			try {
				for (var i in this.results.query_meta_params.groupby){
					var sGroupBy = this.results.query_meta_params.groupby[i];
					this.createGroupByDataTable(this.results.results[sGroupBy], sGroupBy, this.tab.get('contentEl'));
					this.groupByDataTables[sGroupBy].render();				
					this.groupByDataTables[sGroupBy].sortColumn(
						this.groupByDataTables[sGroupBy].getColumn('count'), 
						YAHOO.widget.DataTable.CLASS_DESC);
				}
			}
			catch (e){
				logger.log('Datatable render failed because:', e.stack);
			}
		}
		else {
			var oEl = document.createElement('div');
			oEl.id = 'query_data_table_' + this.id;
	    	this.tab.get('contentEl').appendChild(oEl);
	    	this.createDataTable(this.results, oEl);
			//logger.log('groups: ', this.results.groups);
			//logger.log('length: ' + keys(this.results.groups).length);
			
			try {
				this.renderDataTableHeader();
				this.dataTable.render();
				this.dataTable.sortColumn(
				this.dataTable.getColumn('timestamp'), 
				YAHOO.widget.DataTable.CLASS_ASC);
			}
			catch (e){
				logger.log('Datatable render failed because:', e.stack);
				logger.log('e', e);
			}
		}
		this.tabView.selectTab(this.tabId);
	}
	
	this.renderDataTableHeader = function(){
		var headerContainerDiv = YAHOO.util.Dom.get('query_export_' + this.id);
		var buttonContainerDiv = document.createElement('div');
		buttonContainerDiv.id = 'query_export_' + this.id + '_button';
		var oEl = new YAHOO.util.Element(buttonContainerDiv);
		oEl.setStyle('float', 'left');
		headerContainerDiv.appendChild(buttonContainerDiv);
		
		//	Create an array of YAHOO.widget.MenuItem configuration properties
		var oMenuSources = [ 
			{text:'Save Results...', value:'saveResults', onclick: { fn: YAHOO.ELSA.saveResults, obj:this.id }},
			{text:'Export Results...', value:'exportResults', onclick: { fn: YAHOO.ELSA.exportResults, obj:this.id }},
			{text:'Alert or schedule...', value:'schedule', onclick:{ fn:YAHOO.ELSA.scheduleQuery, obj:this.results.qid}},
			{text:'Send to connector...', value:'sendToConnector', onclick:{ fn:YAHOO.ELSA.sendToConnector, obj:this.id}},
			{text:'Add to Dashboard...', value:'addToDashboard', onclick:{ fn:YAHOO.ELSA.addQueryToChart}}
		];
		
		var oMenuButtonCfg = {
			type: 'menu',
			label: 'Result Options...',
			name: 'result_options_select_button',
			menu: oMenuSources,
			container: buttonContainerDiv
		};
		var oButton = new YAHOO.widget.Button(oMenuButtonCfg);
		logger.log('rendering to ', this.tab.get('contentEl'));
		
		// If there were any errors, display them
		if (this.results.errors && this.results.errors.length > 0){
			var elErrors = document.createElement('b');
			elErrors.innerHTML = 'Errors: ' + this.results.errors.join(', ');
			headerContainerDiv.appendChild(elErrors);
			var oElErrorsDiv = new YAHOO.util.Element(elErrors);
			oElErrorsDiv.addClass('warning');
			headerContainerDiv.appendChild(document.createElement('br'));
		}
		
		// If there were any warnings, display them
		if (this.results.warnings && this.results.warnings.length > 0){
			var elWarnings = document.createElement('b');
			elWarnings.innerHTML = 'Warnings: ' + this.results.warnings.join(', ');
			headerContainerDiv.appendChild(elWarnings);
			var oElWarningsDiv = new YAHOO.util.Element(elWarnings);
			oElWarningsDiv.addClass('warning');
			headerContainerDiv.appendChild(document.createElement('br'));
		}
		
		// create a summary of fields contained within the data as a quick link for navigation
		var elTextNode = document.createElement('b');
		elTextNode.innerHTML = 'Field Summary';
		headerContainerDiv.appendChild(elTextNode);
		
		var oUniqueFields = {};
		for (var i = 0; i < this.dataTable.getRecordSet().getLength(); i++){
			var oRecord = this.dataTable.getRecordSet().getRecord(i);
			for (var j in oRecord.getData()._fields){
				var oFieldHash = oRecord.getData()._fields[j];
				var sFieldName = oFieldHash.field;
				if (typeof oUniqueFields[sFieldName] != 'undefined'){
					oUniqueFields[sFieldName].count++;
					oUniqueFields[sFieldName].classes[oFieldHash['class']] = 1;
					oUniqueFields[sFieldName].values[oFieldHash['value']] = 1;
				}
				else {
					var oClasses = {};
					oClasses[ oFieldHash['class'] ] = 1;
					var oValues = {};
					oValues[ oFieldHash['value'] ] = 1;
					oUniqueFields[sFieldName] = {
						count: 1,
						classes: oClasses,
						values: oValues
					}
				}
			}
		}
		
		var fieldSummaryDiv = document.createElement('div');
		fieldSummaryDiv.id = 'query_export_' + this.id + '_field_summary';
		headerContainerDiv.appendChild(fieldSummaryDiv);
		
		for (var sUniqueField in oUniqueFields){
			var oUniqueField = oUniqueFields[sUniqueField];
			var fieldNameLink = document.createElement('a');
			fieldNameLink.setAttribute('href', '#');
			fieldNameLink.innerHTML = sUniqueField + '(' + keys(oUniqueField.values).length + ')';
			fieldNameLink.id = 'individual_classes_menu_link_' + sUniqueField;
			fieldSummaryDiv.appendChild(fieldNameLink);
			var fieldNameLinkEl = new YAHOO.util.Element(fieldNameLink);
			fieldNameLinkEl.on('click', YAHOO.ELSA.groupData, [ YAHOO.ELSA.getLocalResultId(this.tab), null, sUniqueField ], this);
			fieldSummaryDiv.appendChild(document.createTextNode(' '));
		}
	};
};

YAHOO.ELSA.Results.Tabbed.Saved = function(p_oTabView, p_iQid){
	this.superClass = YAHOO.ELSA.Results.Tabbed;
	
	this.receiveResponse = function(oResponse){
		if (oResponse.responseText){
			var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
			if (typeof oReturn === 'object' && oReturn['error']){
				YAHOO.ELSA.Error(oReturn['error']);
			}
			else if (oReturn){
				//oQuery is this from the current scope
				var oSelf = oResponse.argument[0];
				logger.log(oReturn);
				oSelf.superClass(p_oTabView, oReturn['query_string'], 'Saved Query ' + p_iQid + ': ' + oReturn['query_string']);
				oSelf.loadResponse(oReturn);
			}
			else {
				logger.log(oReturn);
				YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
			}
		}
		else {
			YAHOO.ELSA.Error('No response text');
		}
	};
	
	// Get the saved query data from the server
	var request = YAHOO.util.Connect.asyncRequest('GET', 
			'Query/get_saved_result?qid=' + p_iQid,
			{ 
				success: this.receiveResponse,
				failure:function(oResponse){
					YAHOO.ELSA.Error('Query failed!'); tab.set('content', 'Error!'); return false;
				},
				argument: [this]
			}
	);
}

YAHOO.ELSA.Results.Tabbed.Live = function(p_oTabView, p_oQuery){
	this.superClass = YAHOO.ELSA.Results.Tabbed;
	try {
		this.superClass(p_oTabView, p_oQuery.stringifyTerms(), p_oQuery.stringifyTerms());
	}
	catch (e){
		logger.log('Tabbed.Live failed to create superclass: ', e);
		return false;
	}
	
	this.sentQuery = p_oQuery.toString(); //set this opaque string for later use
	this.query = p_oQuery;
	
	/* Actually do the query */
	//logger.log('query obj:', p_oQuery);
	logger.log('sending query:' + this.sentQuery);//.toString());
	var request = YAHOO.util.Connect.asyncRequest('GET', 
			'Query/query?q=' + encodeURIComponent(this.sentQuery),//.toString()),
			{ 
				success:function(oResponse){
					var oRequest = oResponse.argument[0];
					logger.log('oRequest', oRequest);
					if (oResponse.responseText){
						var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
						if (typeof oReturn === 'object' && oReturn['error']){
							YAHOO.ELSA.Error(oReturn['error']);
							oRequest.closeTab(this);
						}
						else if (oReturn){
							recvQueryResults(oResponse);
						}
						else {
							logger.log(oReturn);
							YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
							oRequest.closeTab(this);
						}
					}
					else {
						YAHOO.ELSA.Error('No response text');
						oRequest.closeTab(this);
					}
					
				}, 
				failure:function(oResponse){
					var oRequest = oResponse.argument[0];
					YAHOO.ELSA.Error('Query failed!'); 
					oRequest.closeTab(this); 
					return false;
				},
				argument: [this]
			}
	);
	
	var recvQueryResults = function(oResponse) {
		logger.log('recvQueryResults got results:', oResponse);
		var oSelf = oResponse.argument[0];
		logger.log('oQuery:', oSelf);
		try{
			if(oResponse.responseText !== undefined && oResponse.responseText){
				try{
					//logger.log('parsing: ', oResponse.responseText);
					var oSavedResults = YAHOO.lang.JSON.parse(oResponse.responseText);
					//logger.log('got results:', oSavedResults);
					oSelf.loadResponse(oSavedResults);
				}
				catch(e){
					logger.log('Could not parse response for form parameters because of an error: ', e.stack);
				}
			}
			else {
				logger.log('Did not receive query results for query id ' + oQuery.id);
			}
		}
		catch(e){
			logger.log('Error receiving query results:', e);
		}
	}
};


YAHOO.ELSA.getPreviousQueries = function(){
	if (!YAHOO.ELSA.previousQueriesDataSource){
		var formatMenu = function(elLiner, oRecord, oColumn, oData){
			// Create menu for our menu button
			var oButtonMenuCfg = [
				{ 
					text: 'Alert or schedule', 
					value: 'schedule', 
					onclick:{
						fn: YAHOO.ELSA.scheduleQuery,
						obj: oRecord.getData().qid
					}
				}
			];
			
			var oButton = new YAHOO.widget.Button(
				{
					type:'menu', 
					label:'Actions',
					name: 'action_button_' + oRecord.getData().qid,
					menu: oButtonMenuCfg,
					container: elLiner
				});
		};
		YAHOO.ELSA.previousQueriesDataSource = new YAHOO.util.DataSource('Query/get_previous_queries?');
		YAHOO.ELSA.previousQueriesDataSource.responseType = YAHOO.util.DataSource.TYPE_JSON;
		YAHOO.ELSA.previousQueriesDataSource.responseSchema = {
			resultsList: "results",
			fields: ["qid", "query", "timestamp", "num_results", "milliseconds" ],
			metaFields: {
				totalRecords: 'totalRecords',
				recordsReturned: 'recordsReturned'
			}
		};
			
	}
	
	// Build the panel if necessary
	if (!YAHOO.ELSA.previousQueriesPanel){
		var oPanel = new YAHOO.ELSA.Panel('previous_queries');
		YAHOO.ELSA.previousQueriesPanel = oPanel.panel;
		YAHOO.ELSA.previousQueriesPanel.setHeader('Query History');
		
		YAHOO.ELSA.previousQueriesPanel.renderEvent.subscribe(function(){
			var myColumnDefs = [
				{ key:'menu', label:'Action', formatter:formatMenu },
				{ key:"qid", label:"QID", formatter:YAHOO.widget.DataTable.formatNumber, sortable:true },
				{ key:"query", label:"Query", sortable:true },
				{ key:"timestamp", label:"Timestamp", editor:"date", formatter:YAHOO.ELSA.Query.formatDate, sortable:true },
				{ key:"num_results", label:"Results", formatter:YAHOO.widget.DataTable.formatNumber, sortable:true },
				{ key:"milliseconds", label:"MS Taken", formatter:YAHOO.widget.DataTable.formatNumber, sortable:true }
			];
			var oPaginator = new YAHOO.widget.Paginator({
			    pageLinks          : 10,
		        rowsPerPage        : 5,
		        rowsPerPageOptions : [5,20],
				template           : "{CurrentPageReport} {PreviousPageLink} {PageLinks} {NextPageLink} {RowsPerPageDropdown}",
		        pageReportTemplate : "<strong>Records: {totalRecords} </strong> "
		    });
		    
		    var oDataTableCfg = {
		    	initialRequest: 'startIndex=0&results=5',
		    	dynamicData:true,
		    	sortedBy : {key:"qid", dir:YAHOO.widget.DataTable.CLASS_DESC},
		    	paginator: oPaginator
		    };
		    var dtDiv = document.createElement('div');
			dtDiv.id = 'previous_queries_dt';
			document.body.appendChild(dtDiv);
			try {	
				YAHOO.ELSA.prevSearchDT = new YAHOO.widget.DataTable(dtDiv, 
					myColumnDefs, YAHOO.ELSA.previousQueriesDataSource, oDataTableCfg );
				YAHOO.ELSA.prevSearchDT.handleDataReturnPayload = function(oRequest, oResponse, oPayload){
					oPayload.totalRecords = oResponse.meta.totalRecords;
					return oPayload;
				}
				YAHOO.ELSA.previousQueriesPanel.setBody(dtDiv);
			}
			catch (e){
				logger.log('Error:', e);
			}
		});
	}
	
	YAHOO.ELSA.previousQueriesPanel.render();
	YAHOO.ELSA.previousQueriesPanel.show();
};

YAHOO.ELSA.scheduleQuery = function(p_sType, p_aArgs, p_iQid){
	var handleSubmit = function(){
		this.submit();
	};
	var handleCancel = function(){
		this.hide();
	};
	var oPanel = new YAHOO.ELSA.Panel('schedule_query', {
		buttons : [ { text:"Submit", handler:handleSubmit, isDefault:true },
			{ text:"Cancel", handler:handleCancel } ]
	});
	
	var handleSuccess = function(p_oResponse){
		var response = YAHOO.lang.JSON.parse(p_oResponse.responseText);
		if (response['error']){
			YAHOO.ELSA.Error(response['error']);
		}
		else {
			YAHOO.ELSA.getQuerySchedule();
			logger.log('successful submission');
		}
	};
	oPanel.panel.callback = {
		success: handleSuccess,
		failure: YAHOO.ELSA.Error
	};
	oPanel.panel.validate = function(){
		if (!this.getData().count || !parseInt(this.getData().count)){
			YAHOO.ELSA.Error('Need a valid integer as an interval');
			return false;
		}
		if (!this.getData().time_unit || !parseInt(this.getData().time_unit)){
			YAHOO.ELSA.Error('Please select a time unit');
			return false;
		}
		if (!(parseInt(this.getData().days) >= 0)){
			YAHOO.ELSA.Error('Please enter a valid number of days to run for.');
			return false;
		}
		return true;
	}
	
	var sFormId = 'interval_select_form';

	var sIntervalSelectButtonId = 'interval_select_button';
	var sIntervalSelectId = 'schedule_input_interval_unit';
	var onIntervalMenuItemClick = function(p_sType, p_aArgs, p_oItem){
		var sText = p_oItem.cfg.getProperty("text");
		// Set the label of the button to be our selection
		var oIntervalButton = YAHOO.widget.Button.getButton(sIntervalSelectButtonId);
		oIntervalButton.set('label', sText);
		var oFormEl = YAHOO.util.Dom.get(sFormId);
		var oInputEl = YAHOO.util.Dom.get(sIntervalSelectId);
		oInputEl.setAttribute('value', p_oItem.value);
	}
	
	//	Create an array of YAHOO.widget.MenuItem configuration properties
	var oIntervalMenuSources = [ 
		{text:'Minute', value:'6', onclick: { fn: onIntervalMenuItemClick }},
		{text:'Hour', value:'5', onclick: { fn: onIntervalMenuItemClick }},
		{text:'Day', value:'4', onclick: { fn: onIntervalMenuItemClick }},
		{text:'Week', value:'3', onclick: { fn: onIntervalMenuItemClick }},
		{text:'Month', value:'2', onclick: { fn: onIntervalMenuItemClick }},
		{text:'Year', value:'1', onclick: { fn: onIntervalMenuItemClick }}
	];
	
	var oIntervalMenuButtonCfg = {
		id: sIntervalSelectButtonId,
		type: 'menu',
		label: 'Minute',
		name: sIntervalSelectButtonId,
		menu: oIntervalMenuSources
	};

	var sConnectorButtonId = 'connector_select_button';
	var sConnectorId = 'schedule_input_connector';
	var onConnectorMenuItemClick = function(p_sType, p_aArgs, p_oItem){
		var sText = p_oItem.cfg.getProperty("text");
		// Set the label of the button to be our selection
		var oConnectorButton = YAHOO.widget.Button.getButton(sConnectorButtonId);
		oConnectorButton.set('label', sText);
		var oFormEl = YAHOO.util.Dom.get(sFormId);
		var oInputEl = YAHOO.util.Dom.get(sConnectorId);
		oInputEl.setAttribute('value', p_oItem.value);
	}
	
	var aConnectorMenu = [
		{ text:'Save report', value:'', onclick: { fn: onConnectorMenuItemClick } }
	];
	for (var i in YAHOO.ELSA.formParams.schedule_actions){
		aConnectorMenu.push({
			text:YAHOO.ELSA.formParams.schedule_actions[i].description, 
			value:YAHOO.ELSA.formParams.schedule_actions[i].action,
			onclick: { fn: onConnectorMenuItemClick } 
		});
	}
	var oConnectorMenuButtonCfg = {
		id: sConnectorButtonId,
		type: 'menu',
		label: 'Send email',
		name: sConnectorButtonId,
		menu: aConnectorMenu
	};
		
	var oFormGridCfg = {
		form_attrs:{
			action: 'Query/schedule_query',
			method: 'POST',
			id: sFormId
		},
		grid: [
			[ {type:'text', args:'Run every'}, {type:'input', args:{id:'schedule_input_interval_count', name:'count', size:2, value:1}}, {type:'widget', className:'Button', args:oIntervalMenuButtonCfg} ],
			[ {type:'text', args:'Days to run'},  {type:'input', args:{id:'schedule_input_start_date', name:'days', value:7, size:2}}, {type:'text', args:'(enter 0 for forever)'} ],
			[ {type:'text', args:'Action'}, {type:'widget', className:'Button', args:oConnectorMenuButtonCfg} ],
			[ {type:'text', args:'Params (optional)'}, {type:'input', args:{id:'connector_params', name:'connector_params', size:20}}],
			[ {type:'input', args:{type:'hidden', id:'schedule_input_qid', name:'qid', value:p_iQid}} ]
		]
	};
	oPanel.panel.setHeader('Schedule or Alert');
	oPanel.panel.setBody('');
	// We need to do the initial render to auto-generate the form so we can hand that object to YAHOO.ELSA.Form
	oPanel.panel.render();
	
	// Now build a new form using the element auto-generated by widget.Dialog
	var oForm = new YAHOO.ELSA.Form(oPanel.panel.form, oFormGridCfg);
	
	// Set some default values
	var oFormEl = YAHOO.util.Dom.get(sFormId);
	
	var oInputEl = document.createElement('input');
	oInputEl.id = sIntervalSelectId;
	oInputEl.setAttribute('type', 'hidden');
	oInputEl.setAttribute('name', 'time_unit');
	oInputEl.setAttribute('value', 6);
	oFormEl.appendChild(oInputEl);
	
	oInputEl = document.createElement('input');
	oInputEl.id = sConnectorId;
	oInputEl.setAttribute('type', 'hidden');
	oInputEl.setAttribute('name', 'connector');
	oInputEl.setAttribute('value', 'Email');
	oFormEl.appendChild(oInputEl);
	
	oPanel.panel.show();
	oPanel.panel.bringToTop();
}

YAHOO.ELSA.saveResults = function(p_sType, p_aArgs, p_iId){
	logger.log('p_iId:', p_iId);
	var iLocalResultId = YAHOO.ELSA.getLocalResultIdFromQueryId(p_iId);
	logger.log('localResultId: ' + iLocalResultId);
	
	var handleSubmit = function(p_sType, p_oDialog){
		var sComments = YAHOO.util.Dom.get('save_results_input').value;
		logger.log('saving comments: ' + sComments + ' for qid ' + p_iId);
		YAHOO.ELSA.localResults[iLocalResultId].save(sComments);
		this.hide();
	};
	var handleCancel = function(){
		this.hide();
	};
	var dialogDiv = document.createElement('div');
	dialogDiv.id = 'save_results';
	document.body.appendChild(dialogDiv);
	YAHOO.ELSA.saveResultsDialog = new YAHOO.widget.Dialog(dialogDiv, {
		underlay: 'none',
		visible:true,
		fixedcenter:true,
		draggable:true,
		buttons : [ { text:"Submit", handler:{ fn:handleSubmit }, isDefault:true },
			{ text:"Cancel", handler:handleCancel } ]
	});
	
	YAHOO.ELSA.saveResultsDialog.validate = function(){
		return true;
	}
		
	var oFormGridCfg = {
		form_attrs:{
			id: 'save_results_form'
		},
		grid: [
			[ {type:'text', args:'Comment'}, {type:'input', args:{id:'save_results_input', name:'comment', size:80}} ]
		]
	};

	// We need to do the initial render to auto-generate the form so we can hand that object to YAHOO.ELSA.Form
	YAHOO.ELSA.saveResultsDialog.setHeader('Save Results');
	YAHOO.ELSA.saveResultsDialog.setBody('');
	YAHOO.ELSA.saveResultsDialog.render();
	
	// Now build a new form using the element auto-generated by widget.Dialog
	var oForm = new YAHOO.ELSA.Form(YAHOO.ELSA.saveResultsDialog.form, oFormGridCfg);
	YAHOO.ELSA.saveResultsDialog.show();
};

YAHOO.ELSA.exportResults = function(p_sType, p_aArgs, p_iId){
	logger.log('p_iId:', p_iId);
	YAHOO.ELSA.exportResults.id = YAHOO.ELSA.getLocalResultIdFromQueryId(p_iId);
	YAHOO.ELSA.exportResults.plugin = '';
	if (!YAHOO.ELSA.exportResultsDialog){
		var handleSubmit = function(p_sType, p_oDialog){
			logger.log('exporting results for query.id ' + YAHOO.ELSA.exportResults.id + ' with method ' + YAHOO.ELSA.exportResults.plugin);
			YAHOO.ELSA.localResults[YAHOO.ELSA.exportResults.id].send(YAHOO.ELSA.exportResults.plugin, 'Query/export');
			this.hide();
		};
		var handleCancel = function(){
			this.hide();
		};
		var dialogDiv = document.createElement('div');
		dialogDiv.id = 'export_results';
		document.body.appendChild(dialogDiv);
		YAHOO.ELSA.exportResultsDialog = new YAHOO.widget.Dialog(dialogDiv, {
			underlay: 'none',
			//zIndex: 3,
			visible:true,
			fixedcenter:true,
			draggable:true,
			buttons : [ { text:"Submit", handler:{ fn:handleSubmit }, isDefault:true },
				{ text:"Cancel", handler:handleCancel } ]
		});
		
		YAHOO.ELSA.exportResultsDialog.validate = function(){
			return true;
		}
		
	}
	
	var oButton;
	//	"click" event handler for each item in the Button's menu
	var onMenuItemClick = function(p_sType, p_aArgs, p_oItem){
		var sText = p_oItem.cfg.getProperty("text");
		// Set the label of the button to be our selection
		oButton.set('label', sText);
		YAHOO.ELSA.exportResults.plugin = p_oItem.value;
	}
	
	//	Create an array of YAHOO.widget.MenuItem configuration properties
	var oMenuSources = [
		{text:'Excel', value:'Spreadsheet', onclick: { fn: onMenuItemClick }},
		{text:'PDF', value:'PDF', onclick: { fn: onMenuItemClick }},
		{text:'CSV', value:'CSV', onclick: { fn: onMenuItemClick }},
		{text:'HTML', value:'HTML', onclick: { fn: onMenuItemClick }},
		{text:'Google Earth', value:'KML', onclick: { fn: onMenuItemClick }}
		//{text:'HTTP Request Tree', value:'HTTPRequestTree', onclick: { fn: onMenuItemClick }}
	];
	
	var oMenuButtonCfg = {
		type: 'menu',
		label: 'Export As...',
		name: 'export_select_button',
		menu: oMenuSources
	};
	
	var menuButtonCallback = function(p_oArgs, p_oWidget, p_oEl){
		// Set this oButton since we apparently can't get it via parent.parent later in MenuItem
		oButton = p_oWidget;
	}
	
	var oFormGridCfg = {
		form_attrs:{
			id: 'export_results_form'
		},
		grid: [
			[ {type:'text', args:'Format to export data'}, {type:'widget', className:'Button', args:oMenuButtonCfg, callback:menuButtonCallback} ]
		]
	};

	// We need to do the initial render to auto-generate the form so we can hand that object to YAHOO.ELSA.Form
	YAHOO.ELSA.exportResultsDialog.setHeader('Export Results');
	YAHOO.ELSA.exportResultsDialog.setBody('');
	YAHOO.ELSA.exportResultsDialog.render();
	
	// Now build a new form using the element auto-generated by widget.Dialog
	var oForm = new YAHOO.ELSA.Form(YAHOO.ELSA.exportResultsDialog.form, oFormGridCfg);
	YAHOO.ELSA.exportResultsDialog.show();
};

YAHOO.ELSA.showAddConnectorDialog = function(p_sType, p_aArgs){
	YAHOO.ELSA.showAddConnectorDialog.plugin = '';
	
	var handleSubmit = function(p_sType, p_oDialog){
		logger.log('with method ' + YAHOO.ELSA.showAddConnectorDialog.plugin);
		var aParams = YAHOO.util.Dom.get('add_connector_params').value.split(/\,/);
		YAHOO.ELSA.currentQuery.addMeta('connector', YAHOO.ELSA.showAddConnectorDialog.plugin);
		YAHOO.ELSA.currentQuery.addMeta('connector_params', aParams);
		this.hide();
	};
	var handleCancel = function(){
		this.hide();
	};
	var oPanel = new YAHOO.ELSA.Panel('add_connector', {
		buttons : [ { text:"Submit", handler:handleSubmit, isDefault:true },
			{ text:"Cancel", handler:handleCancel } ]
	});
	
	var oButton;
	//	"click" event handler for each item in the Button's menu
	var onMenuItemClick = function(p_sType, p_aArgs, p_oItem){
		logger.log('click args: ', arguments);
		var sText = p_oItem.cfg.getProperty("text");
		// Set the label of the button to be our selection
		oButton.set('label', sText);
		YAHOO.ELSA.showAddConnectorDialog.plugin = p_oItem.value;
	}
	
	//	Create an array of YAHOO.widget.MenuItem configuration properties
	var oMenuSources = [];
	for (var i in YAHOO.ELSA.formParams.schedule_actions){
		oMenuSources.push({
			label: YAHOO.ELSA.formParams.schedule_actions[i].description,
			text: YAHOO.ELSA.formParams.schedule_actions[i].description,
			value: YAHOO.ELSA.formParams.schedule_actions[i].action,
			onclick: { fn: onMenuItemClick }
		});
	}
	
	var oMenuButtonCfg = {
		type: 'menu',
		label: 'Add connector...',
		name: 'add_connector_select_button',
		menu: oMenuSources
	};
	
	var menuButtonCallback = function(p_oArgs, p_oWidget, p_oEl){
		// Set this oButton since we apparently can't get it via parent.parent later in MenuItem
		oButton = p_oWidget;
	}
	
	var oFormGridCfg = {
		form_attrs:{
			id: 'add_connector_form'
		},
		grid: [
			[ {type:'text', args:'Add connector'}, {type:'widget', className:'Button', args:oMenuButtonCfg, callback:menuButtonCallback} ],
			[ {type:'text', args:'Params (optional)'}, {type:'input', args:{id:'add_connector_params', name:'add_connector_params', size:20}}]
		]
	};

	// We need to do the initial render to auto-generate the form so we can hand that object to YAHOO.ELSA.Form
	oPanel.panel.setHeader('Add Connector');
	oPanel.panel.setBody('');
	oPanel.panel.render();
	
	// Now build a new form using the element auto-generated by widget.Dialog
	var oForm = new YAHOO.ELSA.Form(oPanel.panel.form, oFormGridCfg);
	oPanel.panel.show();
};

YAHOO.ELSA.sendToConnector = function(p_sType, p_aArgs, p_iId){
	logger.log('sendToConnector p_iId:', p_iId);
	YAHOO.ELSA.sendToConnector.id = YAHOO.ELSA.getLocalResultIdFromQueryId(p_iId);
	YAHOO.ELSA.sendToConnector.plugin = '';
	
	var handleSubmit = function(p_sType, p_oDialog){
		logger.log('sending results for query.id ' + YAHOO.ELSA.sendToConnector.id + ' with method ' + YAHOO.ELSA.sendToConnector.plugin);
		var aParams = YAHOO.util.Dom.get('send_to_params').value.split(/\,/);
		YAHOO.ELSA.sendAll(oPanel.panel, YAHOO.ELSA.sendToConnector.plugin, aParams, YAHOO.ELSA.localResults[YAHOO.ELSA.sendToConnector.id].results.results);
		this.hide();
	};
	var handleCancel = function(){
		this.hide();
	};
	var oPanel = new YAHOO.ELSA.Panel('send_to_connector', {
		buttons : [ { text:"Submit", handler:handleSubmit, isDefault:true },
			{ text:"Cancel", handler:handleCancel } ]
	});
	
	var oButton;
	//	"click" event handler for each item in the Button's menu
	var onMenuItemClick = function(p_sType, p_aArgs, p_oItem){
		logger.log('click args: ', arguments);
		var sText = p_oItem.cfg.getProperty("text");
		// Set the label of the button to be our selection
		oButton.set('label', sText);
		YAHOO.ELSA.sendToConnector.plugin = p_oItem.value;
	}
	
	//	Create an array of YAHOO.widget.MenuItem configuration properties
	var oMenuSources = [];
	for (var i in YAHOO.ELSA.formParams.schedule_actions){
		oMenuSources.push({
			label: YAHOO.ELSA.formParams.schedule_actions[i].description,
			text: YAHOO.ELSA.formParams.schedule_actions[i].description,
			value: YAHOO.ELSA.formParams.schedule_actions[i].action,
			onclick: { fn: onMenuItemClick }
		});
	}
	
	var oMenuButtonCfg = {
		type: 'menu',
		label: 'Send to connector...',
		name: 'send_to_select_button',
		menu: oMenuSources
	};
	
	var menuButtonCallback = function(p_oArgs, p_oWidget, p_oEl){
		// Set this oButton since we apparently can't get it via parent.parent later in MenuItem
		oButton = p_oWidget;
	}
	
	var oFormGridCfg = {
		form_attrs:{
			id: 'send_results_form'
		},
		grid: [
			[ {type:'text', args:'Send to'}, {type:'widget', className:'Button', args:oMenuButtonCfg, callback:menuButtonCallback} ],
			[ {type:'text', args:'Params (optional)'}, {type:'input', args:{id:'send_to_params', name:'send_to_params', size:20}}]
		]
	};

	// We need to do the initial render to auto-generate the form so we can hand that object to YAHOO.ELSA.Form
	oPanel.panel.setHeader('Send Results to Connector');
	oPanel.panel.setBody('');
	oPanel.panel.render();
	
	// Now build a new form using the element auto-generated by widget.Dialog
	var oForm = new YAHOO.ELSA.Form(oPanel.panel.form, oFormGridCfg);
	oPanel.panel.show();
};

YAHOO.ELSA.sendAll = function(p_oPanel, p_sConnector, p_aParams, p_aData){
	var sConnector = p_sConnector + '(' + p_aParams.join(',') + ')';
	logger.log('p_aData', p_aData);
	
	if (!p_aData){
		YAHOO.ELSA.Error('Need a record.');
		return;
	}
	var callback = {
		success: function(oResponse){
			oSelf = oResponse.argument[0];
			if (oResponse.responseText){
				var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
				if (typeof oReturn === 'object'){
					if (oReturn.ret && oReturn.ret == 1){
						logger.log('sent ok');
					}
					else if (oReturn.ret){
						logger.log('sent ok');
						YAHOO.ELSA.sendAll.win = window.open('about:blank');
						YAHOO.ELSA.sendAll.win.document.body.innerText = oResponse.responseText;
//						var oTable = document.createElement('table');
//						var oTbody = document.createElement('tbody');
//						var oTr, oTd;
//						oTable.appendChild(oTbody);
//						for (var i in oReturn.ret){
//							for (var j in oReturn.ret[i].results){
//								var oResult = oReturn.ret[i].results[j];
//								for (var k in oResult){
//									var oRow = oResult[k];
//									oTr = document.createElement('tr');
//									for (var m in oRow){
//										oTd = document.createElement('td');
//										oTd.innerHTML = m;
//										oTr.appendChild(oTd);
//										oTd = document.createElement('td');
//										oTd.innerText = oRow[m];
//										oTr.appendChild(oTd);
//									}
//									oTbody.appendChild(oTr);
//								}
//							}
//						}
						YAHOO.ELSA.sendAll.win.document.body.appendChild(oTable);
					}
					else {
						logger.log('oReturn', oReturn);
						YAHOO.ELSA.Error('Send failed');
					}
					p_oPanel.hide();
				}
				else {
					logger.log(oReturn);
				}
			}
			else {
				logger.log(oReturn);
			}
		},
		failure: function(oResponse){
			return [ false, ''];
		},
		argument: [this]
	};
	var sPayload = YAHOO.lang.JSON.stringify({results:{results:p_aData}, connectors:[sConnector], query:YAHOO.ELSA.currentQuery.toObject()});
	sPayload.replace(/;/, '', 'g');
	logger.log('sPayload: ' + sPayload);
	var oConn = YAHOO.util.Connect.asyncRequest('POST', 'send_to', callback, 'data=' + encodeURIComponent(Base64.encode(sPayload)));
}

YAHOO.ELSA.exportData = function(p_sType, p_aArgs, p_oData){
	YAHOO.ELSA.exportData.data = p_oData;
	if (!YAHOO.ELSA.exportDataDialog){
		var handleSubmit = function(p_sType, p_oDialog){
			logger.log('exporting data with method ' + YAHOO.ELSA.exportData.plugin, YAHOO.ELSA.exportData.data);
			YAHOO.ELSA.send(YAHOO.ELSA.exportData.plugin, 'Query/export', YAHOO.ELSA.exportData.data);
			this.hide();
		};
		var handleCancel = function(){
			this.hide();
		};
		var dialogDiv = document.createElement('div');
		dialogDiv.id = 'export_data';
		document.body.appendChild(dialogDiv);
		YAHOO.ELSA.exportDataDialog = new YAHOO.widget.Dialog(dialogDiv, {
			underlay: 'none',
			visible:true,
			fixedcenter:true,
			draggable:true,
			buttons : [ { text:"Submit", handler:{ fn:handleSubmit }, isDefault:true },
				{ text:"Cancel", handler:handleCancel } ]
		});
		
		YAHOO.ELSA.exportDataDialog.validate = function(){
			return true;
		}
		
	}
	
	//	"click" event handler for each item in the Button's menu
	var onMenuItemClick = function(p_sType, p_aArgs, p_oItem){
		var sText = p_oItem.cfg.getProperty("text");
		// Set the label of the button to be our selection
		var oButton = YAHOO.widget.Button.getButton('export_select_button');
		oButton.set('label', sText);
		YAHOO.ELSA.exportData.plugin = p_oItem.value;
	}
	
	//	Create an array of YAHOO.widget.MenuItem configuration properties
	var oMenuSources = [
		{text:'Excel', value:'Spreadsheet', onclick: { fn: onMenuItemClick }},
		{text:'PDF', value:'PDF', onclick: { fn: onMenuItemClick }},
		{text:'CSV', value:'CSV', onclick: { fn: onMenuItemClick }},
		{text:'HTML', value:'HTML', onclick: { fn: onMenuItemClick }}
	];
	
	var oMenuButtonCfg = {
		id: 'export_select_button',
		type: 'menu',
		label: 'Export As...',
		name: 'export_select_button',
		menu: oMenuSources
	};
	
	var oFormGridCfg = {
		form_attrs:{
			id: 'export_results_form'
		},
		grid: [
			[ {type:'text', args:'Format to export data'}, {type:'widget', className:'Button', args:oMenuButtonCfg} ]
		]
	};

	// We need to do the initial render to auto-generate the form so we can hand that object to YAHOO.ELSA.Form
	YAHOO.ELSA.exportDataDialog.setHeader('Export Data');
	YAHOO.ELSA.exportDataDialog.setBody('');
	YAHOO.ELSA.exportDataDialog.render();
	
	// Now build a new form using the element auto-generated by widget.Dialog
	var oForm = new YAHOO.ELSA.Form(YAHOO.ELSA.exportDataDialog.form, oFormGridCfg);
	YAHOO.ELSA.exportDataDialog.show();
};

YAHOO.ELSA.Error = function(p_sError){
	logger.log('got error', p_sError);
	var oNotificationPanel = new YAHOO.ELSA.Panel('error', {visible:true, modal:true});
	var oEl = new YAHOO.util.Element(oNotificationPanel.panel.header);
	oEl.addClass('error');
	oNotificationPanel.panel.setBody(p_sError);
	oNotificationPanel.panel.setHeader('Error');
	oNotificationPanel.panel.render();
	oNotificationPanel.panel.show();
};

YAHOO.ELSA.getSavedQueries = function(){
	if (!YAHOO.ELSA.getSavedQueries.dataSource){
		var formatMenu = function(elLiner, oRecord, oColumn, oData){
			// Create menu for our menu button
			var oButtonMenuCfg = [
				{ 
					text: 'Get Results', 
					value: 'get', 
					onclick:{
						fn: YAHOO.ELSA.getSavedResult,
						obj: oRecord.getData().qid
					}
				},
				{ 
					text: 'Alert or schedule', 
					value: 'schedule', 
					onclick:{
						fn: YAHOO.ELSA.scheduleQuery,
						obj: oRecord.getData().qid
					}
				},
				{ 
					text: 'Delete', 
					value: 'delete', 
					onclick:{
						fn: function(p_sType, p_aArgs, p_iQid){
							oSavedQuery = new YAHOO.ELSA.Results.Saved(p_iQid);
							oSavedQuery.remove();
						},
						obj: oRecord.getData().qid
					}
				}
			];
			
			var oButton = new YAHOO.widget.Button(
				{
					type:'menu', 
					label:'Actions',
					name: 'action_button_' + oRecord.getData().qid,
					menu: oButtonMenuCfg,
					container: elLiner
				});
		};
		YAHOO.ELSA.getSavedQueries.dataSource = new YAHOO.util.DataSource('Query/get_saved_queries?');
		YAHOO.ELSA.getSavedQueries.dataSource.responseType = YAHOO.util.DataSource.TYPE_JSON;
		YAHOO.ELSA.getSavedQueries.dataSource.responseSchema = {
			resultsList: "results",
			fields: ["qid", "query", "timestamp", "num_results", "comments", "hash" ],
			metaFields: {
				totalRecords: 'totalRecords',
				recordsReturned: 'recordsReturned'
			}
		};
			
	}
	
	// Build the panel if necessary
	if (!YAHOO.ELSA.getSavedQueries.panel){
		var oPanel = new YAHOO.ELSA.Panel('saved_queries');
		YAHOO.ELSA.getSavedQueries.panel = oPanel.panel;
		YAHOO.ELSA.getSavedQueries.panel.setHeader('Saved Queries');
		
		var formatPermaLink = function(elLiner, oRecord, oColumn, oData){
			elLiner.innerHTML = '<a href="get_results?qid=' + oRecord.getData().qid + '&hash=' + oRecord.getData().hash + '">permalink</a>';
		}
		
		YAHOO.ELSA.getSavedQueries.panel.renderEvent.subscribe(function(){
			var myColumnDefs = [
				{ key:'menu', label:'Action', formatter:formatMenu },
				{ key:"qid", label:"QID", formatter:YAHOO.widget.DataTable.formatNumber, sortable:true },
				{ key:"query", label:"Query", sortable:true },
				{ key:"timestamp", label:"Timestamp", editor:"date", formatter:YAHOO.ELSA.formatDateFromUnixTime, sortable:true },
				{ key:"num_results", label:"Results", formatter:YAHOO.widget.DataTable.formatNumber, sortable:true },
				{ key:"comments", label:"Comments", sortable:true },
				{ key:"permalink", label:"Permalink", formatter:formatPermaLink }
			];
			var oPaginator = new YAHOO.widget.Paginator({
			    pageLinks          : 10,
		        rowsPerPage        : 5,
		        rowsPerPageOptions : [5,20],
		        template           : "{CurrentPageReport} {PreviousPageLink} {PageLinks} {NextPageLink} {RowsPerPageDropdown}",
		        pageReportTemplate : "<strong>Records: {totalRecords} </strong> "
		    });
		    
		    var oDataTableCfg = {
		    	initialRequest: 'startIndex=0&results=5',
		    	initialLoad: true,
		    	dynamicData: true,
		    	sortedBy : {key:"qid", dir:YAHOO.widget.DataTable.CLASS_DESC},
		    	paginator: oPaginator //,
		    	//MSG_EMPTY: 'Loading...'
		    };
		    var dtDiv = document.createElement('div');
			dtDiv.id = 'saved_queries_dt';
			document.body.appendChild(dtDiv);
			try {	
				YAHOO.ELSA.getSavedQueries.dataTable = new YAHOO.widget.DataTable(dtDiv, 
					myColumnDefs, YAHOO.ELSA.getSavedQueries.dataSource, oDataTableCfg );
				YAHOO.ELSA.getSavedQueries.dataTable.handleDataReturnPayload = function(oRequest, oResponse, oPayload){
					oPayload.totalRecords = oResponse.meta.totalRecords;
					return oPayload;
				}
				YAHOO.ELSA.getSavedQueries.panel.setBody(dtDiv);
			}
			catch (e){
				logger.log('Error:', e);
			}
		});
	}
	YAHOO.ELSA.getSavedQueries.panel.render();
	YAHOO.ELSA.getSavedQueries.panel.show();
};

YAHOO.ELSA.getQuerySchedule = function(){
	if (!YAHOO.ELSA.getQuerySchedule.dataSource){
		var deleteScheduledQuery = function(p_sType, p_aArgs, p_oRecord){
			oQuery = new YAHOO.ELSA.Query.Scheduled(p_oRecord);
			oQuery.remove();
		};
		var formatMenu = function(elLiner, oRecord, oColumn, oData){
			// Create menu for our menu button
			var oButtonMenuCfg = [
				{ 
					text: 'Delete', 
					value: 'delete', 
					onclick:{
						fn: deleteScheduledQuery,
						obj: oRecord
					}
				}
			];
			
			var oButton = new YAHOO.widget.Button(
				{
					type:'menu', 
					label:'Actions',
					menu: oButtonMenuCfg,
					container: elLiner
				});
		};
		YAHOO.ELSA.getQuerySchedule.dataSource = new YAHOO.util.DataSource('Query/get_scheduled_queries?');
		YAHOO.ELSA.getQuerySchedule.dataSource.responseType = YAHOO.util.DataSource.TYPE_JSON;
		YAHOO.ELSA.getQuerySchedule.dataSource.responseSchema = {
			resultsList: 'results',
			fields: ['id', 'query', 'frequency', 'start', 'end', 'connector', 'params', 'enabled', 'last_alert', 'alert_threshold' ],
			metaFields: {
				totalRecords: 'totalRecords',
				recordsReturned: 'recordsReturned'
			}
		};
			
	}
	else {
		// we need fresh data!
		logger.log('refreshing data table');
		YAHOO.ELSA.getQuerySchedule.dataTable.initializeTable();
	}
	
	YAHOO.ELSA.getQuerySchedule.dropRow = function(p_iRecordSetId){
		logger.log('deleting recordset id ' + p_iRecordSetId);
		YAHOO.ELSA.getQuerySchedule.dataTable.deleteRow(p_iRecordSetId);
	};
	
	// Build the panel if necessary
	if (!YAHOO.ELSA.getQuerySchedule.panel){
		var oPanel = new YAHOO.ELSA.Panel('query_schedule');
		YAHOO.ELSA.getQuerySchedule.panel = oPanel.panel;
		
		var makeFrequency = function(p_i){
			var ret = [];
			for (var i = 1; i <=7; i++){
				if (i == p_i){
					ret.push(1);
				}
				else {
					ret.push(0);
				}
			}
			return ret.join(':');
		};
		
		var aIntervalValues = [
			{ label:'Year', value: makeFrequency(1) },
			{ label:'Month', value: makeFrequency(2) },
			{ label:'Week', value: makeFrequency(3) },
			{ label:'Day', value: makeFrequency(4) },
			{ label:'Hour', value: makeFrequency(5) },
			{ label:'Minute', value: makeFrequency(6) },
			{ label:'Second', value: makeFrequency(7) }
		];
		
		var formatInterval = function(elLiner, oRecord, oColumn, oData){
			var aTimeUnits = oData.split(':');
			
			for (var i = 0; i < aTimeUnits.length; i++){
				if (aTimeUnits[i] == 1){
					elLiner.innerHTML = aIntervalValues[i]['label'];
					logger.log('setting interval: ' + aIntervalValues[i]['label']);
				}
			}
		};
		
		var aEnabledValues = [
			{ label: 'Disabled', value: 0 },
			{ label: 'Enabled', value: 1 }
		];
		
		var formatEnabled = function(elLiner, oRecord, oColumn, oData){
			var i = parseInt(oData);
			if (!i){
				i = 0;
			}
			elLiner.innerHTML = aEnabledValues[i]['label'];
		};
		
		var formatQuery  = function(elLiner, oRecord, oColumn, oData){
			try {
				oParsed = YAHOO.lang.JSON.parse(oData);
				elLiner.innerHTML = oParsed['query_string'];
			}
			catch (e){
				logger.log(e);
				elLiner.innerHTML = '';
			}
		};
		
		var formatConnector = function(elLiner, oRecord, oColumn, oData){
			logger.log('connector data:', oData);
			logger.log('column', oColumn);
			logger.log('record', oRecord);
			elLiner.innerHTML = oData;
		}
		var formatThreshold = function(elLiner, oRecord, oColumn, oData){
			var p_i = parseInt(oData);
			logger.log('oData', oData);
			logger.log('oColumn', oColumn);
			logger.log('oRecord', oRecord);
			if (!p_i){
				elLiner.innerHTML = oData;
			}
			else {
				if (p_i >= 86400){
					elLiner.innerHTML = (p_i / 86400) + ' days';
				}
				else if (p_i >= 3600){
					elLiner.innerHTML = (p_i / 3600) + ' hours';
				}
				else if (p_i >= 60){
					elLiner.innerHTML = (p_i / 60) + ' minutes';
				}
				else {
					elLiner.innerHTML = p_i + ' seconds';	
				}
			}
		}
		
		YAHOO.ELSA.getQuerySchedule.panel.setHeader('Scheduled Queries');
		
		var asyncSubmitter = function(p_fnCallback, p_oNewValue){
			// called in the scope of the editor
			logger.log('editor this: ', this);
			logger.log('p_oNewValue:', p_oNewValue);
			
			var oRecord = this.getRecord(),
				oColumn = this.getColumn(),
				sOldValue = this.value,
				oDatatable = this.getDataTable();
			logger.log('column:', oColumn);
			
			var oQuery = new YAHOO.ELSA.Query.Scheduled(oRecord);
			logger.log('oQuery:', oQuery);
			oQuery.set(oColumn.field, p_oNewValue); //will call the asyncSubmitterCallback
		};
		
		YAHOO.ELSA.getQuerySchedule.asyncSubmitterCallback = function(p_bSuccess, p_oNewValue){
			logger.log('arguments:', arguments);
			logger.log('callback p_bSuccess', p_bSuccess);
			logger.log('callback p_oNewValue:', p_oNewValue);
			if (p_bSuccess){
				logger.log('setting ' + YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().getColumn().field + ' to ' + p_oNewValue);
				YAHOO.ELSA.getQuerySchedule.dataTable.updateCell(
					YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().getRecord(),
					YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().getColumn(),
					p_oNewValue
				);
			}
			YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().unblock();
			YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().cancel(); //hides box
		};
		
		// Set up editing flow
		var highlightEditableCell = function(p_oArgs) {
			var elCell = p_oArgs.target;
			if(YAHOO.util.Dom.hasClass(elCell, "yui-dt-editable")) {
				this.highlightCell(elCell);
			}
		};
		
		YAHOO.ELSA.getQuerySchedule.cellEditorValidatorInt = function(p_sInputValue, p_sCurrentValue, p_oEditorInstance){
			return parseInt(p_sInputValue);
		};
		
		YAHOO.ELSA.getQuerySchedule.cellEditorValidatorJSON = function(p_sInputValue, p_sCurrentValue, p_oEditorInstance){
			try {
				return YAHOO.lang.JSON.parse(p_sInputValue);
			}
			catch (e){
				YAHOO.ELSA.Error(e);
				return p_sCurrentValue;
			}
		};
		
		YAHOO.ELSA.getQuerySchedule.cellEditorValidatorQuery = function(p_sInputValue, p_sCurrentValue, p_oEditorInstance){
			var oQueryParams;
			try {
				oQueryParams = YAHOO.lang.JSON.parse(p_sInputValue);
			}
			catch (e){
				YAHOO.ELSA.Error(e);
				return;
			}
			logger.log('query_string:', typeof oQueryParams['query_string']);
			if (!oQueryParams['query_string'] || typeof oQueryParams['query_meta_params'] != 'object'){
				YAHOO.ELSA.Error('Need query_string and query_meta_params in obj');
				return;
			}
			return oQueryParams;
		};
		
		YAHOO.ELSA.getQuerySchedule.onEventShowCellEditor = function(p_oArgs){
			logger.log('p_oArgs', p_oArgs);
			this.onEventShowCellEditor(p_oArgs);
			logger.log('YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor():',YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor());
			// increase the size of the textbox, if we have one
			if (YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor() && YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().textbox){				
				YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().textbox.setAttribute('size', 20);
				YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().textbox.removeAttribute('style');
				// create key listener for the submit
				var enterKeyListener = new YAHOO.util.KeyListener(
						YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().textbox,
						{ keys: 13 },
						{ 	fn: function(eName, p_aArgs){
								var oEvent = p_aArgs[1];
								// Make sure we don't submit the form
								YAHOO.util.Event.stopEvent(oEvent);
								var tgt=(oEvent.target ? oEvent.target : 
									(oEvent.srcElement ? oEvent.srcElement : null)); 
								try{
									tgt.blur();
								}
								catch(e){}
								var op = '=';
								YAHOO.ELSA.getQuerySchedule.dataTable.getCellEditor().save();
							},
							scope: YAHOO.ELSA,
							correctScope: false
						}
				);
				enterKeyListener.enable();
			}
		}
		
		var aConnectors = [
			{ label:'Save report (no action)', value:'' }
		];
		for (var i in YAHOO.ELSA.formParams.schedule_actions){
			aConnectors.push({
				label: YAHOO.ELSA.formParams.schedule_actions[i].description,
				value: YAHOO.ELSA.formParams.schedule_actions[i].action
			});
		}
		
		
		YAHOO.ELSA.getQuerySchedule.panel.renderEvent.subscribe(function(){
			var myColumnDefs = [
				{ key:'menu', label:'Action', formatter:formatMenu },
				{ key:"id", label:"ID", formatter:YAHOO.widget.DataTable.formatNumber, sortable:true },
				{ key:"query", label:"Query", formatter:formatQuery, sortable:true, editor: new YAHOO.widget.TextareaCellEditor({width:'500px', height:'8em', asyncSubmitter:asyncSubmitter, validator:YAHOO.ELSA.getQuerySchedule.cellEditorValidatorQuery}) },
				{ key:'frequency', label:'Interval', formatter:formatInterval, sortable:true, editor: new YAHOO.widget.DropdownCellEditor({asyncSubmitter:asyncSubmitter, dropdownOptions:aIntervalValues}) },
				{ key:'start', label:'Starts On', formatter:YAHOO.ELSA.formatDateFromUnixTime, sortable:true, editor: new YAHOO.widget.DateCellEditor({asyncSubmitter:asyncSubmitter}) },
				{ key:'end', label:'Ends On', formatter:YAHOO.ELSA.formatDateFromUnixTime, sortable:true, editor: new YAHOO.widget.DateCellEditor({asyncSubmitter:asyncSubmitter}) },
				{ key:'connector', label:'Action', formatter:formatConnector, sortable:true, editor: new YAHOO.widget.DropdownCellEditor({asyncSubmitter:asyncSubmitter, dropdownOptions:aConnectors}) },
				{ key:'enabled', label:'Enabled', formatter:formatEnabled, sortable:true, editor: new YAHOO.widget.DropdownCellEditor({asyncSubmitter:asyncSubmitter, dropdownOptions:aEnabledValues}) },
				{ key:'last_alert', label:'Last Alert', formatter:YAHOO.ELSA.formatDateFromUnixTime, sortable:true },
				{ key:'alert_threshold', label:'Alert Threshold', formatter:formatThreshold, editor: new YAHOO.widget.TextboxCellEditor({asyncSubmitter:asyncSubmitter, validator:YAHOO.ELSA.getQuerySchedule.cellEditorValidatorInt}) }
			];
			var oPaginator = new YAHOO.widget.Paginator({
			    pageLinks          : 10,
		        rowsPerPage        : 5,
		        rowsPerPageOptions : [5,20],
		        template           : "{CurrentPageReport} {PreviousPageLink} {PageLinks} {NextPageLink} {RowsPerPageDropdown}",
		        pageReportTemplate : "<strong>Records: {totalRecords} </strong> "
		    });
		    
		    var oDataTableCfg = {
		    	initialRequest: 'startIndex=0&results=5',
		    	initialLoad: true,
		    	dynamicData: true,
		    	sortedBy : {key:"id", dir:YAHOO.widget.DataTable.CLASS_DESC},
		    	paginator: oPaginator
		    };
		    var dtDiv = document.createElement('div');
			dtDiv.id = 'saved_queries_dt';
			document.body.appendChild(dtDiv);
			YAHOO.ELSA.getQuerySchedule.dataTable = '';
			try {	
				YAHOO.ELSA.getQuerySchedule.dataTable = new YAHOO.widget.DataTable(dtDiv, 
					myColumnDefs, YAHOO.ELSA.getQuerySchedule.dataSource, oDataTableCfg );
				logger.log(YAHOO.ELSA.getQuerySchedule.dataSource);
				logger.log(YAHOO.ELSA.getQuerySchedule.dataTable);
				YAHOO.ELSA.getQuerySchedule.dataTable.handleDataReturnPayload = function(oRequest, oResponse, oPayload){
					oPayload.totalRecords = oResponse.meta.totalRecords;
					return oPayload;
				}
				
				YAHOO.ELSA.getQuerySchedule.dataTable.subscribe("cellClickEvent", 
					YAHOO.ELSA.getQuerySchedule.onEventShowCellEditor);
				YAHOO.ELSA.getQuerySchedule.panel.setBody(dtDiv);
			}
			catch (e){
				logger.log('Error:', e);
			}
		});
	}
	
	YAHOO.ELSA.getQuerySchedule.panel.render();
	YAHOO.ELSA.getQuerySchedule.panel.show();
};

YAHOO.ELSA.async = function(p_sUrl, p_oCallback, p_oPostData, p_oObject){
	var callback_wrapper = {
		success: function(oResponse){
			callback = oResponse.argument[0];
			if (oResponse.responseText){
				var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
				if (typeof oReturn === 'object'){
					if (oReturn['error']){
						YAHOO.ELSA.Error(oReturn['error']);
						callback(false);
					}
					else {
						callback(oReturn);
					}
				}
				else {
					logger.log(oReturn);
					YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
				}
			}
			else {
				YAHOO.ELSA.Error('No response text');
			}
		},
		failure: function(oResponse){ YAHOO.ELSA.Error('Error with asyncGet ' + oResponse.toString()); },
		argument:[p_oCallback]
	};
	
	if (p_oPostData){
		var aPost = [];
		for (var i in p_oPostData){
			if (typeof(p_oPostData[i]) == 'object'){
				aPost.push(i + '=' + YAHOO.lang.JSON.stringify(p_oPostData[i]));
			}
			else {
				aPost.push(i + '=' + encodeURIComponent(p_oPostData[i]));
			}
		}
		var sPost = aPost.join('&');
		var oConn = YAHOO.util.Connect.asyncRequest('POST', p_sUrl, callback_wrapper, sPost);
	}
	else {
		var oConn = YAHOO.util.Connect.asyncRequest('GET', p_sUrl, callback_wrapper);
	}
}

YAHOO.ELSA.getDashboards = function(){
	
	var oPanel = new YAHOO.ELSA.Panel('Dashboards');
	oPanel.panel.setHeader('Dashboards');
	oPanel.panel.render();
	
	var aAuthMenu = [
		{ text:'Public', value:0 },
		{ text:'Any authenticated user', value:1 },
		{ text:'Specific group', value:2 }
	];
	
	var deleteDashboard = function(p_sType, p_aArgs, p_a){
		var p_oRecord = p_a[0], p_oDataTable = p_a[1];
		var oData = p_oRecord.getData();
		oData.recordSetId = p_oRecord.getId();
		logger.log('oData', oData);
		var oConfirmationPanel = new YAHOO.ELSA.Panel.Confirmation(function(p_oEvent, p_oData){
			var oPanel = this;
			oPanel.hide();
			
			var removeCallback = {
				success: function(oResponse){
					var oData = oResponse.argument[0];
					if (oResponse.responseText){
						var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
						if (typeof oReturn === 'object'){
							if (oReturn['error']){
								YAHOO.ELSA.Error(oReturn['error']);
							}
							else {
								logger.log('deleted dashboard ' + oData.id);
								// find the row in the data table and delete it
								p_oDataTable.deleteRow(oData.recordSetId);
							}
						}
						else {
							logger.log(oReturn);
							YAHOO.ELSA.Error('Could not parse responseText: ' + oResponse.responseText);
						}
					}
					else {
						YAHOO.ELSA.Error('No response text');
					}
				},
				failure: function(oResponse){ YAHOO.ELSA.Error('Error deleting dashboard ' + oData.id); },
				argument: [oData]
			};
			var oConn = YAHOO.util.Connect.asyncRequest('POST', 'Charts/del_dashboard', removeCallback,
				'id=' + p_oData.id);
		}, oData, 'Really delete dashboard?');
	}
	var viewDashboard = function(p_sType, p_aArgs, p_a){
		var p_oRecord = p_a[0], p_oDataTable = p_a[1];
		var oData = p_oRecord.getData();
		logger.log('oData', oData);
		var oWindow = window.open('dashboard/' + oData.alias);
	};
	var editDashboard = function(p_sType, p_aArgs, p_a){
		var p_oRecord = p_a[0], p_oDataTable = p_a[1];
		var oData = p_oRecord.getData();
		logger.log('oData', oData);
		var oWindow = window.open('dashboard/' + oData.alias + '?edit');
	};
	var exportDashboard = function(p_sType, p_aArgs, p_a){
		var p_oRecord = p_a[0], p_oDataTable = p_a[1];
		var oData = p_oRecord.getData();
		//oData.dataTable = p_oDataTable;
		oData.recordSetId = p_oRecord.getId();
		logger.log('oData', oData);
		YAHOO.ELSA.send(null, 'Charts/export_dashboard', p_oRecord.getData().id);
	}
	var formatMenu = function(elLiner, oRecord, oColumn, oData){
		// Create menu for our menu button
		var oButtonMenuCfg = [
			{ 
				text: 'View', 
				value: 'view', 
				onclick:{
					fn: viewDashboard,
					obj: [oRecord,this]
				}
			},
			{ 
				text: 'Delete', 
				value: 'delete', 
				onclick:{
					fn: deleteDashboard,
					obj: [oRecord,this]
				}
			},
			{ 
				text: 'Edit', 
				value: 'edit', 
				onclick:{
					fn: editDashboard,
					obj: [oRecord,this]
				}
			},
			{ 
				text: 'Export', 
				value: 'export', 
				onclick:{
					fn: exportDashboard,
					obj: [oRecord,this]
				}
			}
		];
		
		var oButton = new YAHOO.widget.Button(
			{
				type:'menu', 
				label:'Actions',
				menu: oButtonMenuCfg,
				name: 'dashboard_menu_button',
				container: elLiner
			});
	};
	
    var oElCreate = document.createElement('a');
    oElCreate.href = '#';
    oElCreate.innerHTML = 'Create/import new dashboard';
    oPanel.panel.body.appendChild(oElCreate);
    var oElCreateEl = new YAHOO.util.Element(oElCreate);
    oElCreateEl.on('click', function(){
    	logger.log('creating dashboard');
    	var handleSubmit = function(p_sType, p_oDialog){
			this.submit();
		};
		var handleCancel = function(){
			this.hide();
		};
		var oCreatePanel = new YAHOO.ELSA.Panel('Create Dashboard', {
			buttons : [ { text:"Submit", handler:handleSubmit, isDefault:true },
				{ text:"Cancel", handler:handleCancel } ]
		});
		var handleSuccess = function(p_oResponse){
			var response = YAHOO.lang.JSON.parse(p_oResponse.responseText);
			if (response['error']){
				YAHOO.ELSA.Error(response['error']);
			}
			else {
				oCreatePanel.panel.hide();
				logger.log('YAHOO.ELSA.getDashboards.dataTable', YAHOO.ELSA.getDashboards.dataTable);
				//YAHOO.ELSA.getDashboards.dataTable.load();
				YAHOO.ELSA.getDashboards.dataTable.getDataSource().sendRequest(YAHOO.ELSA.getDashboards.dataTable.get('initialRequest'), {
					success: YAHOO.ELSA.getDashboards.dataTable.onDataReturnInitializeTable,
					failure: YAHOO.ELSA.getDashboards.dataTable.onDataReturnInitializeTable,
					scope: YAHOO.ELSA.getDashboards.dataTable,
					argument: YAHOO.ELSA.getDashboards.dataTable.getState()
				});
				logger.log('successful submission');
			}
		};
		oCreatePanel.panel.callback = {
			success: handleSuccess,
			failure: YAHOO.ELSA.Error
		};
		
		oCreatePanel.panel.renderEvent.subscribe(function(){
			
			var sAuthButtonId = 'auth_select_button';
			var sAuthId = 'auth_input_connector';
			var onAuthMenuItemClick = function(p_sType, p_aArgs, p_oItem){
				var sText = p_oItem.cfg.getProperty("text");
				// Set the label of the button to be our selection
				var oAuthButton = YAHOO.widget.Button.getButton(sAuthButtonId);
				oAuthButton.set('label', sText);
				var oFormEl = YAHOO.util.Dom.get(sFormId);
				var oInputEl = YAHOO.util.Dom.get(sAuthId);
				oInputEl.setAttribute('value', p_oItem.value);
			}
			var onAuthMenuItemClickChooseGroups = function(p_sType, p_aArgs, p_oItem){
				var sText = p_oItem.cfg.getProperty("text");
				// Set the label of the button to be our selection
				var oAuthButton = YAHOO.widget.Button.getButton(sAuthButtonId);
				oAuthButton.set('label', sText);
				var oFormEl = YAHOO.util.Dom.get(sFormId);
				var oInputEl = YAHOO.util.Dom.get(sAuthId);
				oInputEl.setAttribute('value', p_oItem.value);
				oCreatePanel.panel.form.appendChild(document.createTextNode('Groups'));
				var oElNew = document.createElement('input');
				oElNew.name = 'groups';
				oElNew.id = 'auth_groups';
				oCreatePanel.panel.form.appendChild(oElNew);
			}
			
			var aAuthMenu = [
				{ text:'Public', value:0, onclick: { fn: onAuthMenuItemClick } },
				{ text:'Any authenticated user', value:1, onclick: { fn: onAuthMenuItemClick } },
				{ text:'Specific group', value:2, onclick: { fn: onAuthMenuItemClickChooseGroups } }
			];
			
			var oAuthMenuButtonCfg = {
				id: sAuthButtonId,
				type: 'menu',
				label: 'Who has access',
				name: sAuthButtonId,
				menu: aAuthMenu
			};
			
			oCreatePanel.panel.setBody('');
			oCreatePanel.panel.setHeader('Create New Dashboard');
			oCreatePanel.panel.bringToTop();
			//var sFormId = 'create_dashboard_form';
			var sFormId = oCreatePanel.panel.form.id;
			
			var oFormGridCfg = {
				form_attrs:{
					action: 'Charts/add_dashboard',
					method: 'POST',
					id: sFormId
				},
				grid: [
					[ {type:'text', args:'Title'}, {type:'input', args:{id:'dashboard_title', name:'title', size:32}} ],
					[ {type:'text', args:'Alias (end of URL for access)'}, {type:'input', args:{id:'dashboard_alias', name:'alias', size:32}} ],
					[ {type:'text', args:'Auth'}, {type:'widget', className:'Button', args:oAuthMenuButtonCfg} ],
					[ {type:'text', args:'(Paste here for import)'}, {type:'element', element:'textarea', args:{id:'dashboard_import_data', name:'data', rows:1, cols:32}} ]
				]
			};
			
			// Now build a new form using the element auto-generated by widget.Dialog
			var oForm = new YAHOO.ELSA.Form(oCreatePanel.panel.form, oFormGridCfg);
			
			var oInputEl = document.createElement('input');
			oInputEl.id = sAuthId;
			oInputEl.setAttribute('type', 'hidden');
			oInputEl.setAttribute('name', 'auth_required');
			oInputEl.setAttribute('value', 0);
			oForm.form.appendChild(oInputEl);
		});
		oCreatePanel.panel.render();
		oCreatePanel.panel.show();
    });
    
    var oElDiv = document.createElement('div');
	oElDiv.id = 'dashboards_dt';
	oPanel.panel.body.appendChild(oElDiv);
	
	var asyncSubmitter = function(p_fnCallback, p_oNewValue){
		// called in the scope of the editor
		logger.log('editor this: ', this);
		var oEditor = this;
		logger.log('p_oNewValue:', p_oNewValue);
		
		var oRecord = this.getRecord(),
			oColumn = this.getColumn(),
			sOldValue = this.value,
			oDatatable = this.getDataTable();
		logger.log('sOldValue:', sOldValue);
		logger.log('oColumn.getKey()', oColumn.getKey());
		
		var oNewValue = p_oNewValue;
		var oSendValue = oNewValue;
		
		YAHOO.ELSA.async('Charts/update_dashboard?id=' + oRecord.getData().id + '&col=' + oColumn.getKey() + '&val=' + oSendValue, function(p_oReturn){
			if (p_oReturn.ok && p_oReturn.ok > 0){
				// update the edit queries datatable
				oDatatable.updateCell(oRecord, oColumn, oNewValue);
				p_fnCallback(true,oNewValue);
			}
			else {
				p_fnCallback(false);
			}
		});
	};
	
//	var asyncSubmitterAuth = function(p_fnCallback, p_oNewValue){
//		// called in the scope of the editor
//		logger.log('editor this: ', this);
//		logger.log('p_oNewValue:', p_oNewValue);
//		
//		var oRecord = this.getRecord(),
//			oColumn = this.getColumn(),
//			sOldValue = this.value,
//			oDatatable = this.getDataTable();
//		logger.log('sOldValue:', sOldValue);
//		logger.log('oColumn.getKey()', oColumn.getKey());
//		
//		var oNewValue = p_oNewValue;
//		var oSendValue = oNewValue;
//		
//		var sSendStr = 'Charts/update_dashboard?id=' + oRecord.getData().id + '&col=' + oColumn.getKey() + '&val=' + oSendValue;
//		
//		var handleSubmit = function(p_sType, p_oDialog){
//			sSendStr += '&auth_groups=' + YAHOO.util.Dom.get('auth_groups').value;
//			YAHOO.ELSA.async(sSendStr, function(p_oReturn){
//				if (p_oReturn.ok && p_oReturn.ok > 0){
//					// update the edit queries datatable
//					oDatatable.updateCell(oRecord, oColumn, oNewValue);
//					p_fnCallback(true,oNewValue);
//				}
//				else {
//					YAHOO.ELSA.Error(p_oReturn.warnings);
//				}
//			});
//			this.hide();
//		};
//		var handleCancel = function(){
//			this.hide();
//		};
//		var oCreatePanel = new YAHOO.ELSA.Panel('Auth Groups', {
//			buttons : [ { text:"Submit", handler:handleSubmit, isDefault:true },
//				{ text:"Cancel", handler:handleCancel } ]
//		});
//		
//		oCreatePanel.panel.setHeader('Groups');
//		oCreatePanel.panel.form.appendChild(document.createTextNode('Groups'));
//		var oElNew = document.createElement('input');
//		oElNew.name = 'groups';
//		oElNew.id = 'auth_groups';
//		oCreatePanel.panel.form.appendChild(oElNew);
//		
//		oCreatePanel.panel.render();
//		oCreatePanel.panel.show();
//	};
	
	var cellEditorValidatorQuery = function(p_sInputValue, p_sCurrentValue, p_oEditorInstance){
		return p_sInputValue;
	};
	
	var onEventShowCellEditor = function(p_oArgs){
		logger.log('p_oArgs', p_oArgs);
		var oEl = new YAHOO.util.Element(p_oArgs.target);
		if (!oEl.hasClass('yui-dt-editable')){
			return;
		}
		this.onEventShowCellEditor(p_oArgs);
		if (YAHOO.ELSA.getDashboards.dataTable.getCellEditor().value != null && typeof(YAHOO.ELSA.getDashboards.dataTable.getCellEditor().value) == 'object'){
			YAHOO.ELSA.getDashboards.dataTable.getCellEditor().textarea.value = YAHOO.ELSA.getDashboards.dataTable.getCellEditor().value.query_string;
		}
		
		// increase the size of the textbox, if we have one
		if (YAHOO.ELSA.getDashboards.dataTable.getCellEditor() && YAHOO.ELSA.getDashboards.dataTable.getCellEditor().textbox){				
			YAHOO.ELSA.getDashboards.dataTable.getCellEditor().textbox.setAttribute('size', 20);
			YAHOO.ELSA.getDashboards.dataTable.getCellEditor().textbox.removeAttribute('style');
			// create key listener for the submit
			var enterKeyListener = new YAHOO.util.KeyListener(
					YAHOO.ELSA.getDashboards.dataTable.getCellEditor().textbox,
					{ keys: 13 },
					{ 	fn: function(eName, p_aArgs){
							var oEvent = p_aArgs[1];
							// Make sure we don't submit the form
							YAHOO.util.Event.stopEvent(oEvent);
							var tgt=(oEvent.target ? oEvent.target : 
								(oEvent.srcElement ? oEvent.srcElement : null)); 
							try{
								tgt.blur();
							}
							catch(e){}
							var op = '=';
							this.getCellEditor().save();
						},
						scope: YAHOO.ELSA,
						correctScope: false
					}
			);
			enterKeyListener.enable();
		}
	}
	
	var oDataSource = new YAHOO.util.DataSource('Charts/get_dashboards?');
	oDataSource.responseType = YAHOO.util.DataSource.TYPE_JSON;
	oDataSource.responseSchema = {
		resultsList: 'results',
		fields: ['id', 'alias', 'title', 'auth_required', 'groupname' ],
		metaFields: {
			totalRecords: 'totalRecords',
			recordsReturned: 'recordsReturned'
		}
	};
	
	var aAuthDropDownMenu = [];
	for (var i in aAuthMenu){
		aAuthDropDownMenu.push({label: aAuthMenu[i].text, value: aAuthMenu[i].value});
	}
	
	var formatAuth = function(elLiner, oRecord, oColumn, oData){
		for (var i in aAuthMenu){
			if (aAuthMenu[i].value == oData){
				elLiner.innerHTML = aAuthMenu[i].text;
				break;
			}
		}
	}
			
	var oColumnDefs = [
		{ key:'menu', label:'Action', formatter:formatMenu },
		{ key:"id", label:"ID", formatter:YAHOO.widget.DataTable.formatNmber, sortable:true },
		{ key:"alias", label:"Alias", sortable:true,
			editor: new YAHOO.widget.TextboxCellEditor({asyncSubmitter:asyncSubmitter}) },
		{ key:"title", label:"Title", sortable:true,
			editor: new YAHOO.widget.TextboxCellEditor({asyncSubmitter:asyncSubmitter}) },
		{ key:"auth_required", label:"Auth Required", sortable:true, formatter:formatAuth,
			editor: new YAHOO.widget.DropdownCellEditor({dropdownOptions:aAuthDropDownMenu, asyncSubmitter:asyncSubmitter}) },
		{ key:"groupname", label:"Auth Group", sortable:true,
			editor: new YAHOO.widget.DropdownCellEditor({dropdownOptions:YAHOO.ELSA.formParams.groups, asyncSubmitter:asyncSubmitter}) }
	];
	var oPaginator = new YAHOO.widget.Paginator({
	    pageLinks          : 10,
        rowsPerPage        : 5,
        rowsPerPageOptions : [5,20],
        template           : "{CurrentPageReport} {PreviousPageLink} {PageLinks} {NextPageLink} {RowsPerPageDropdown}",
        pageReportTemplate : "<strong>Records: {totalRecords} </strong> "
    });
    
    var oDataTableCfg = {
    	sortedBy : {key:"id", dir:YAHOO.widget.DataTable.CLASS_DESC},
    	paginator: oPaginator
    };
	
	try {
		YAHOO.ELSA.getDashboards.dataTable = new YAHOO.widget.DataTable(oElDiv,	oColumnDefs, oDataSource, oDataTableCfg);
		YAHOO.ELSA.getDashboards.dataTable.handleDataReturnPayload = function(oRequest, oResponse, oPayload){
			oPayload.totalRecords = oResponse.meta.totalRecords;
			return oPayload;
		}
		YAHOO.ELSA.getDashboards.dataTable.subscribe("cellClickEvent", onEventShowCellEditor);
		
		//oPanel.panel.setBody(oElDiv);
		oPanel.panel.body.appendChild(oElDiv);
	}
	catch (e){
		logger.log('Error:', e);
	}
	
	//oPanel.panel.render();
	oPanel.panel.show();
};

YAHOO.ELSA.formatDateFromUnixTime = function(p_elCell, oRecord, oColumn, p_oData)
{
	logger.log('p_oData', p_oData);
	var oDate = p_oData;
	if(p_oData instanceof Date){
	}
	else {
		var mSec = p_oData * 1000;
		oDate = new Date();
		oDate.setTime(mSec);
	}
	p_elCell.innerHTML = oDate.toString();
	oRecord.setData(oColumn.key, oDate);
};

YAHOO.ELSA.getSavedResult = function(p_sType, p_aArgs, p_iQid){
	var oSavedResults = new YAHOO.ELSA.Results.Tabbed.Saved(YAHOO.ELSA.tabView, p_iQid);
};

YAHOO.ELSA.getPcap = function(p_sType, p_aArgs, p_oRecord){
	logger.log('p_oRecord', p_oRecord);
	
	if (!p_oRecord){
		YAHOO.ELSA.Error('Need a record selected to get pcap for.');
		return;
	}
	
	var oData = {};
	for (var i in p_oRecord.getData()['_fields']){
		oData[ p_oRecord.getData()['_fields'][i].field ] =  p_oRecord.getData()['_fields'][i].value;
	}
	var oIps = {};
	var aQuery = [];
	
	//if (defined(oData.proto) && oData.proto.toLowerCase() != 'tcp'){
	//	YAHOO.ELSA.Error('Only TCP is supported for pcap retrieval.');
	//}
	
	var aQueryParams = [ 'srcip', 'dstip', 'srcport', 'dstport' ];
	for (var i in aQueryParams){
		var sParam = aQueryParams[i];
		if (defined(oData[sParam])){
			aQuery.push(sParam + '=' + oData[sParam]);
		}
	}
	var sQuery = aQuery.join('&');
	
	// tack on the start/end +/- one minute
	var oStart = new Date( p_oRecord.getData().timestamp );
	oStart.setMinutes( p_oRecord.getData().timestamp.getMinutes() - 2 );
	var oEnd = new Date( p_oRecord.getData().timestamp );
	oEnd.setMinutes( p_oRecord.getData().timestamp.getMinutes() + 1 );
	sQuery += '&start=' + getISODateTime(oStart) + '&end=' + getISODateTime(oEnd);
	
	var oPcapWindow = window.open(YAHOO.ELSA.pcapUrl + '/?' + sQuery);
}

YAHOO.ELSA.old_getPcap = function(p_sType, p_aArgs, p_oRecord){
	logger.log('p_oRecord', p_oRecord);
	
	if (!p_oRecord){
		YAHOO.ELSA.Error('Need a record selected to get pcap for.');
		return;
	}
	
	var oData = {};
	for (var i in p_oRecord.getData()['_fields']){
		oData[ p_oRecord.getData()['_fields'][i].field ] =  p_oRecord.getData()['_fields'][i].value;
	}
	var oIps = {};
	var sQuery = 'q=';
	
	if (defined(oData.proto) && defined(oData.srcip) && defined(oData.dstip) && defined(oData.srcport) && defined(oData.dstport)){
		sQuery = oData.proto + ' ' + oData.srcip + ':' + oData.srcport + ' ' + oData.dstip + ':' + oData.dstport;
	}
	else if (defined(oData.srcip) && defined(oData.dstip)){
		sQuery = oData.srcip + ' ' + oData.dstip;
	}
	else if (defined(oData.ip)){
		sQuery = oData.ip;
	}
	else {
		// attempt to find an ip in the msg
		var re = new RegExp(/[\D](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[\D]/);
		var aMatches = oData.msg.match(re);
		if (aMatches.length > 0){
			sQuery = aMatches[1];
		}
		else {
			YAHOO.ELSA.Error('No IP found in message');
			return;
		}
	}
	
	// tack on the start/end +/- one minute
	var oStart = new Date( p_oRecord.getData().timestamp );
	oStart.setMinutes( p_oRecord.getData().timestamp.getMinutes() - 1 );
	var oEnd = new Date( p_oRecord.getData().timestamp );
	oEnd.setMinutes( p_oRecord.getData().timestamp.getMinutes() + 1 );
	sQuery += '&start=' + getISODateTime(oStart) + '&end=' + getISODateTime(oEnd) + '&submit=1';
	
	// is the current view dev?
	var sView = '';
	if (YAHOO.ELSA.viewMode == 'dev'){
		sView = 'view=dev&';
	}
	var oPcapWindow = window.open('pcap?' + sView + 'q=' + sQuery);
	logger.log(oPcapWindow);
}

YAHOO.ELSA.getInfo = function(p_oEvent, p_oRecord){
	var oRecord = p_oRecord;
	logger.log('p_oRecord', oRecord);
	
	var oData = {};
	for (var i in oRecord.getData()['_fields']){
		oData[ oRecord.getData()['_fields'][i].field ] =  oRecord.getData()['_fields'][i].value;
	}
	logger.log('oData:', oData);
	
	var callback = {
		success: function(p_oResponse){
			var oData = YAHOO.lang.JSON.parse(p_oResponse.responseText);
			logger.log('response oData: ', oData);
			if (typeof oData.error != 'undefined'){
				YAHOO.ELSA.Error('JSON error parsing response: ' + oData.error);
				return;
			}
			YAHOO.ELSA.showLogInfo(oData, oRecord);
		},
		failure: function(oResponse){
			YAHOO.ELSA.Error('Error getting pcap.');
		}
	};
	
	var sData = 'q=' + Base64.encode(YAHOO.lang.JSON.stringify(oData));
	logger.log('sData', sData);
	
	var oConn = YAHOO.util.Connect.asyncRequest('POST', 'Query/get_log_info', callback, sData);
}

YAHOO.ELSA.showLogInfo = function(p_oData, p_oRecord){
	if (!YAHOO.ELSA.logInfoDialog){
		var handleSubmit = function(){
			this.submit();
		};
		var handleCancel = function(){
			this.hide();
		};
		var handleSuccess = function(p_oResponse){
			var response = YAHOO.lang.JSON.parse(p_oResponse.responseText);
			if (response['error']){
				YAHOO.ELSA.Error(response['error']);
			}
			else {
				YAHOO.ELSA.getQuerySchedule();
				logger.log('successful submission');
			}
		};
		var oPanel = new YAHOO.ELSA.Panel('log_info', {
			underlay: 'none',
			buttons : [ { text:"Close", handler:handleCancel } ],
			fixedcenter: true
		});
		YAHOO.ELSA.logInfoDialog = oPanel.panel;
		
		YAHOO.ELSA.logInfoDialog.callback = {
			success: handleSuccess,
			failure: YAHOO.ELSA.Error
		};
		YAHOO.ELSA.logInfoDialog.validate = function(){
			return true;
		}
	}
	
	YAHOO.ELSA.logInfoDialog.setHeader('Log Info');
	YAHOO.ELSA.logInfoDialog.setBody('');
	// We need to do the initial render to auto-generate the form so we can hand that object to YAHOO.ELSA.Form
	YAHOO.ELSA.logInfoDialog.render();
	
	var oTable = document.createElement('table');
	var oTbody = document.createElement('tbody');
	oTable.appendChild(oTbody);
	
	var oTr = document.createElement('tr');
	oTbody.appendChild(oTr);
	
	var oTd = document.createElement('td');
	oTd.innerHTML = 'Summary';
	oTr.appendChild(oTd);
	
	oTr = document.createElement('tr');
	oTbody.appendChild(oTr);
	
	oTd = document.createElement('td');
	oTd.innerHTML = p_oData.summary;
	oTr.appendChild(oTd);
	
	oTr = document.createElement('tr');
	oTbody.appendChild(oTr);
	
	oTd = document.createElement('td');
	oTd.innerHTML = 'Links';
	oTr.appendChild(oTd);
	
	oTr = document.createElement('tr');
	oTbody.appendChild(oTr);
	
	oTd = document.createElement('td');
	for (var i in p_oData.urls){
		var oA = document.createElement('a');
		oA.href = p_oData.urls[i];
		oA.innerHTML = p_oData.urls[i];
		oA.target = '_new';
		oTd.appendChild(oA);
		oTd.appendChild(document.createElement('br'));
	}
	oTr.appendChild(oTd);
	
	oTr = document.createElement('tr');
	oTbody.appendChild(oTr);
	
	oTd = document.createElement('td');
	oTd.innerHTML = 'Plugins';
	oTr.appendChild(oTd);
	
	oTr = document.createElement('tr');
	oTbody.appendChild(oTr);
	
	oTd = document.createElement('td');
	var oDiv = document.createElement('div');
	oDiv.id = 'container_log_info_plugin_select_button';
	oTd.appendChild(oDiv);
	oTr.appendChild(oDiv);
	
	oTr = document.createElement('tr');
	oTbody.appendChild(oTr);
	
	oTd = document.createElement('td');
	oTd.appendChild(document.createTextNode('Plugin params (optional)'));
	oTr.appendChild(oTd);
	
	var oInput = document.createElement('input');
	oInput.name = 'params';
	oInput.id = 'log_info_params';
	oTd.appendChild(oInput);
	oTr.appendChild(oTd);
	
	YAHOO.ELSA.logInfoDialog.body.appendChild(oTable);

	//	Create an array of YAHOO.widget.MenuItem configuration properties
	var aPluginMenuSources = [ ];
	for (var i in p_oData.plugins){
		var sPluginName = p_oData.plugins[i];
		var aMatches = sPluginName.match(/^send_to_(.+)/);
		if (aMatches && aMatches.length){
			aPluginMenuSources.push({
				text: 'Send to ' + aMatches[1],
				onclick: { fn: YAHOO.ELSA.sendFromMenu, obj:[aMatches[1], p_oRecord] }
			});
		}
		else {
			aPluginMenuSources.push({
				text: sPluginName,
				onclick: { fn: YAHOO.ELSA[sPluginName], obj:p_oRecord }
			});
		}
	}
	var fnSort = function(a,b){ return a.text.charCodeAt(0) < b.text.charCodeAt(0) };
	aPluginMenuSources.sort(fnSort);  // make alphabetical order
	
	var oPluginMenuButtonCfg = {
		id: 'log_info_plugin_select_button',
		type: 'menu',
		label: 'Plugin',
		name: 'log_info_plugin_select_button',
		menu: aPluginMenuSources,
		container: oDiv.id
	};
	
	var oMenuButton = new YAHOO.widget.Button(oPluginMenuButtonCfg);
	
	YAHOO.ELSA.logInfoDialog.show();
	YAHOO.ELSA.logInfoDialog.bringToTop();
}

YAHOO.ELSA.sendFromMenu = function(p_sType, p_aArgs, p_a){
	var sParams = '(' + YAHOO.util.Dom.get('log_info_params').value + ')';
	var p_sPlugin = p_a[0] + sParams;
	logger.log('p_sPlugin ' + p_sPlugin);
	var p_oRecord = p_a[1];
	logger.log('p_oRecord', p_oRecord);
	
	if (!p_oRecord){
		YAHOO.ELSA.Error('Need a record.');
		return;
	}
	var callback = {
		success: function(oResponse){
			oSelf = oResponse.argument[0];
			if (oResponse.responseText){
				var oReturn = YAHOO.lang.JSON.parse(oResponse.responseText);
				if (typeof oReturn === 'object'){
					if (oReturn.ret && oReturn.ret == 1){
						logger.log('sent ok');
					}
					else if (oReturn.ret){
						logger.log('sent ok');
						YAHOO.ELSA.sendAll.win = window.open('about:blank');
						YAHOO.ELSA.sendAll.win.document.body.innerText = oResponse.responseText;
						YAHOO.ELSA.sendAll.win.document.body.appendChild(oTable);
					}
					else {
						logger.log('oReturn', oReturn);
						YAHOO.ELSA.Error('Send failed');
					}
					YAHOO.ELSA.logInfoDialog.hide();
				}
				else {
					logger.log(oReturn);
				}
			}
			else {
				logger.log(oReturn);
			}
		},
		failure: function(oResponse){
			return [ false, ''];
		},
		argument: [this]
	};
	var sPayload = YAHOO.lang.JSON.stringify({results:{results:[p_oRecord.getData()]}, connectors:[p_sPlugin], query:YAHOO.ELSA.currentQuery.toObject()});
	sPayload.replace(/;/, '', 'g');
	logger.log('sPayload: ' + sPayload);
	var oConn = YAHOO.util.Connect.asyncRequest('POST', 'send_to', callback, 'data=' + encodeURIComponent(Base64.encode(sPayload)));
}

YAHOO.ELSA.ip2long = function(ip) {
    var ips = ip.split('.');
    var iplong = 0;
    with (Math) {
        iplong = parseInt(ips[0])*pow(256,3)
        +parseInt(ip[1])*pow(256,2)
        +parseInt(ips[2])*pow(256,1)
        +parseInt(ips[3])*pow(256,0);
    }
    return iplong;
}

YAHOO.ELSA.send = function(p_sPlugin, p_sUrl, p_oData){
	logger.log('sendResults');
	if (!p_sUrl){
		throw new Error('No URL given to send results to!');
	}
	
	var oForm = document.createElement('form');
	YAHOO.util.Dom.addClass(oForm, 'hiddenElement');
	oForm.setAttribute('method', 'POST');
	oForm.setAttribute('action', p_sUrl);
	oForm.setAttribute('target', '_blank');
	
	
	var oPluginInput = document.createElement('input');
	oPluginInput.setAttribute('name', 'plugin');
	oPluginInput.setAttribute('value', p_sPlugin);
	oForm.appendChild(oPluginInput);
	
	var oDataInput = document.createElement('input');
	oDataInput.setAttribute('name', 'data');
	oDataInput.setAttribute('type', 'hidden');
	oDataInput.setAttribute('maxlength', 2147483647);
	if (typeof(p_oData) == 'object'){
		oDataInput.setAttribute('value', encodeURIComponent(YAHOO.lang.JSON.stringify(p_oData)));
	}
	else {
		oDataInput.setAttribute('value', p_oData);
	}
	oForm.appendChild(oDataInput);
	
	
	document.body.appendChild(oForm);
	logger.log('Sending results: ', p_oData);
	oForm.submit();
	
}

YAHOO.ELSA.Panel = function(p_sName, p_oArgs){
	this.name = p_sName;
	if (YAHOO.ELSA.panels[p_sName]){
		YAHOO.ELSA.overlayManager.remove(YAHOO.ELSA.panels[p_sName].panel);
		YAHOO.ELSA.panels[p_sName].panel.destroy();
		delete YAHOO.ELSA.panels[p_sName];
	}
//	if (YAHOO.ELSA.panels[p_sName]){
//		logger.log('YAHOO.ELSA.panels[p_sName]', YAHOO.ELSA.panels[p_sName]);
//		YAHOO.ELSA.panels[p_sName].panel.setHeader('');
//		YAHOO.ELSA.panels[p_sName].panel.setBody('');
//		return YAHOO.ELSA.panels[p_sName];
//	}
	
	var elRootDiv = document.getElementById('panel_root');
	var elNewDiv = document.createElement('div');
	elNewDiv.id = 'panel_' + p_sName;
	elRootDiv.appendChild(elNewDiv);
	this.divId = elNewDiv.id;
	
	var oPanelCfg = {
		fixedcenter: false,
		close: true,
		draggable: true,
		dragOnly: true,
		visible: false,
		constraintoviewport: true
	};
	// Override with given args
	if (p_oArgs){
		for (var key in p_oArgs){
			oPanelCfg[key] = p_oArgs[key];
		}
	}
	
	if (oPanelCfg.buttons){
		this.panel = new YAHOO.widget.Dialog(elNewDiv.id, oPanelCfg);
	}
	else {
		this.panel = new YAHOO.widget.Panel(elNewDiv.id, oPanelCfg);
	}
	
	this.panel.setBody(''); //init to empty
	this.panel.render();
	
	YAHOO.ELSA.panels[p_sName] = this; // register for possible re-use later
	YAHOO.ELSA.overlayManager.register(this.panel);
	return this;
}

YAHOO.ELSA.Panel.Confirmation = function(p_callback, p_oCallbackArgs, p_sMessage){ 
	var oPanel = new YAHOO.ELSA.Panel('confirmation', 
		{
			buttons: [ 
				{ 
					text:"Submit", 
					handler: {
						fn: p_callback, 
						obj: p_oCallbackArgs
					}
				},
				{ text:"Cancel", handler:function(){ this.hide(); }, isDefault:true } 
			]
		}
	);
	this.panel = oPanel.panel;
	this.panel.setHeader('Confirm');
	//var oEl = new YAHOO.util.Element(this.panel.header);
	//oEl.addClass('error');
	this.panel.setBody(p_sMessage);
	this.panel.render();
	this.panel.show();
	//this.panel.bringToTop();
	YAHOO.ELSA.overlayManager.bringToTop(this.panel);
}

YAHOO.ELSA.Warn = function(p_sMessage){
	logger.log('WARNING: ' + p_sMessage);
}

YAHOO.ELSA.Calendars = {};
YAHOO.ELSA.Calendar = function(p_sType, p_oFormParams){
	var sContainer = p_sType + '_container';
	var oEl = YAHOO.util.Dom.get(sContainer);
	if (!oEl){
		oEl = document.createElement('div');
		oEl.id = sContainer;
		YAHOO.util.Dom.get('query_form').appendChild(oEl);
	}
	this.dialog = new YAHOO.widget.Dialog(sContainer, {
		visible:false,
		context:["show", "tl", "bl"],
		buttons:[
			{
				text:"Reset",
				handler: this.resetHandler,
				isDefault:true
			},
			{
				text:"Close",
				handler: this.closeHandler
			}
		],
		draggable:false,
		close:true
	});
	
	this.dialog.setHeader(p_sType);
	var sCalendarContainer = p_sType + '_calendar_container';
	this.dialog.setBody('<div id="' + sCalendarContainer + '"></div>');
	this.dialog.render('query_form');
	
	var oMinDate = new Date();
	var oMaxDate = new Date();
	var oMinTime = getDateFromISO(p_oFormParams['start']);
	var oMaxTime = getDateFromISO(p_oFormParams['end']);
	
	if(oMinTime){
	        oMinDate.setTime(oMinTime);
	}
	if(oMaxTime){
	        oMaxDate.setTime(oMaxTime);
	}

	this.calendar = new YAHOO.widget.Calendar(sCalendarContainer,{
		mindate: oMinDate,
		maxdate: oMaxDate,
		pagedate: oMaxDate,
	});
	
	this.calendar.render();
	this.calendar.show();
	
	var onCalendarButtonClick = function(p_sType, p_aArgs){
		var aDate;
		var aMatches = this.containerId.split('_');
		var sTimeType = aMatches[0];
		try {
			if (p_aArgs){
				aDate = p_aArgs[0][0];
				// get previous time
				var re = new RegExp(/(\d{2}:\d{2}:\d{2})/);
				logger.log('p_sTimeType', sTimeType);
				var aTime = re.exec(YAHOO.util.Dom.get(sTimeType + '_time').value);
				var sTime = '00:00:00';
				if (aTime){
					sTime = aTime[0];
				}
				logger.log('aDate', aDate);
				logger.log('sTime: ' + sTime);
				var sNewDateTime = formatDateTimeAsISO(aDate[1] + '/' + aDate[2] + '/' + aDate[0] + ' ' + sTime);
				YAHOO.util.Dom.get(sTimeType + '_time').value = sNewDateTime;
				YAHOO.ELSA.currentQuery.addMeta(sTimeType + '_time', sNewDateTime);
			}
		} catch (e){ logger.log(e) }

		YAHOO.ELSA.Calendars[sTimeType].dialog.hide();
	}
	
	this.calendar.selectEvent.subscribe(onCalendarButtonClick, this.calendar, true);
	
	YAHOO.ELSA.Calendars[p_sType] = this;
}

YAHOO.ELSA.Calendar.prototype.closeHandler = function(p_oEvent, p_oThis){
	p_oThis.hide();
}

YAHOO.ELSA.Calendar.prototype.resetHandler = function(p_oEvent, p_oThis){
	var aMatches = this.id.split('_');
	var sTimeType = aMatches[0];
	var oCalendar = YAHOO.ELSA.Calendars[sTimeType].calendar;
		
	// Reset the current calendar page to the select date, or 
	// to today if nothing is selected.
	var selDates = oCalendar.getSelectedDates();
	var resetDate;
        
	if (selDates.length > 0) {
		resetDate = selDates[0];
	}
	else {
		resetDate = oCalendar.today;
	}
    
	oCalendar.cfg.setProperty("pagedate", resetDate);
	oCalendar.render();
}

YAHOO.ELSA.addQueryToChart = function(p_sType, p_aArgs){
	var p_sPathToQueryDir = '';
	var p_sQuery = YAHOO.ELSA.currentQuery.queryString;
	var p_sGroupBy = '';
	if (YAHOO.ELSA.currentQuery.metas.groupby && YAHOO.ELSA.currentQuery.metas.groupby[0]){
		p_sGroupBy = YAHOO.ELSA.currentQuery.metas.groupby[0];
	}
	logger.log('adding query: ', p_sQuery);
	//YAHOO.ELSA.async(p_sPathToQueryDir + 'Charts/get_all', addQuery);
	YAHOO.ELSA.async(p_sPathToQueryDir + 'Charts/get_dashboards', addQuery);
	function addQuery(p_oReturn){
		if (!p_oReturn){
			return;
		}
		if (p_oReturn.totalRecords == 0){
			YAHOO.ELSA.Error('You need to create a dashboard first.');
			return;
		}
		logger.log('adding query');
		var handleSubmit = function(p_sType, p_oDialog){
			this.submit();
		};
		var handleCancel = function(){
			this.hide();
		};
		var oCreatePanel = new YAHOO.ELSA.Panel('Create Chart', {
			buttons : [ { text:"Submit", handler:handleSubmit, isDefault:true },
				{ text:"Cancel", handler:handleCancel } ]
		});
		var handleSuccess = function(p_oResponse){
			var response = YAHOO.lang.JSON.parse(p_oResponse.responseText);
			if (response['error']){
				YAHOO.ELSA.Error(response['error']);
			}
			else {
				oCreatePanel.panel.hide();
				logger.log('successful submission');
			}
		};
		oCreatePanel.panel.callback = {
			success: handleSuccess,
			failure: YAHOO.ELSA.Error
		};
		
		oCreatePanel.panel.validate = function(){
			if (!this.getData().query){
				YAHOO.ELSA.Error('Need a query');
				return false;
			}
			if (!this.getData().dashboard_id || !parseInt(this.getData().dashboard_id)){
				YAHOO.ELSA.Error('Please select a dashboard');
				return false;
			}
			if (!this.getData().chart_id){
				YAHOO.ELSA.Error('Please select a chart');
				return false;
			}
			return true;
		}
		
		oCreatePanel.panel.renderEvent.subscribe(function(){
			oCreatePanel.panel.setBody('');
			oCreatePanel.panel.setHeader('Add Query to Chart');
			oCreatePanel.panel.bringToTop();
			//var sFormId = 'create_dashboard_form';
			var sFormId = oCreatePanel.panel.form.id;
			
			var sChartButtonId = 'chart_select_button';
			var sDashboardButtonId = 'dashboard_select_button';
			var sChartId = 'chart_id';
			var sDashboardId = 'dashboard_id';
			var fnOnChartMenuItemClick = function(p_sType, p_aArgs, p_oItem){
				var sText = p_oItem.cfg.getProperty("text");
				logger.log('sText ' + sText);
				// Set the label of the button to be our selection
				var oButton = YAHOO.widget.Button.getButton(sChartButtonId);
				oButton.set('label', sText);
				var oFormEl = YAHOO.util.Dom.get(sFormId);
				var oInputEl = YAHOO.util.Dom.get(sChartId);
				oInputEl.setAttribute('value', p_oItem.value);
			}
			
			var fnOnDashboardMenuItemClick = function(p_sType, p_aArgs, p_oItem){
				var sText = p_oItem.cfg.getProperty("text");
				logger.log('sText ' + sText);
				// Set the label of the button to be our selection
				
				var oDashboardButton = YAHOO.widget.Button.getButton(sDashboardButtonId);
				oDashboardButton.set('label', sText);
				
				YAHOO.util.Dom.get('dashboard_id').value = p_oItem.value;
								
				YAHOO.ELSA.async(p_sPathToQueryDir + 'Charts/get?dashboard_id=' + p_oItem.value, function(p_oReturn){
					if (!p_oReturn){
						return;
					}
					var oButton = YAHOO.widget.Button.getButton(sChartButtonId);
					var oMenu = oButton.getMenu();
				
					oMenu.clearContent();
					var aNewItems = [{selected:true, text:'New Chart', value:'__NEW__', onclick:{fn:fnOnChartMenuItemClick}}];
					for (var i in p_oReturn.charts){
						var oRow = p_oReturn.charts[i];
						aNewItems.push({text: oRow.chart_options.title + ' ' + oRow.chart_type, value:oRow.chart_id, onclick:{fn:fnOnChartMenuItemClick}});
					}
					//oMenu.addItems(aNewItems);
					oMenu.itemData = aNewItems;
					oButton.set('disabled', false);
					//oMenu.focus();
					oMenu.setInitialSelection(0);
					//oMenu.setInitialFocus();
					//oMenu.render();
					logger.log('omenu', oMenu);
				});
			}
						
			var aChartMenu = [];
			var aDashboardMenu = [];
			for (var i in p_oReturn.results){
				var oRow = p_oReturn.results[i];
				//aChartMenu.push({text: oRow.alias + '/' + oRow.chart_options.title, value:oRow.chart_id, onclick:{fn:fnOnChartMenuItemClick}});
				//aChartMenu.push({text: oRow.chart_options.title, value:oRow.chart_id, onclick:{fn:fnOnChartMenuItemClick}});
				aDashboardMenu.push({text: oRow.alias, value:oRow.id, onclick:{fn:fnOnDashboardMenuItemClick}});
			}
			
			var oChartMenuButtonCfg = {
				id: sChartButtonId,
				type: 'menu',
				label: 'Choose Chart',
				name: sChartButtonId,
				menu: aChartMenu,
				disabled: true
			};
			var oDashboardMenuButtonCfg = {
				id: sDashboardButtonId,
				type: 'menu',
				label: 'Choose Dashboard',
				name: sDashboardButtonId,
				menu: aDashboardMenu
			};
			var sQuery = p_sQuery;
			//if (!sQuery.match(/groupby[\:\=](\w+)/i)){
			if (p_sGroupBy){
				sQuery += ' groupby:' + p_sGroupBy;
			}
			
			var oFormGridCfg = {
				form_attrs:{
					action: p_sPathToQueryDir + 'Charts/add_query',
					method: 'POST',
					id: sFormId
				},
				grid: [
					[ {type:'text', args:'Label'}, {type:'input', args:{id:'label', name:'label', size:32, value:p_sQuery}} ],
					[ {type:'text', args:'Query'}, {type:'input', args:{id:'query', name:'query', size:64, value:sQuery}} ],
					[ {type:'text', args:'Dashboard'}, {type:'widget', className:'Button', args:oDashboardMenuButtonCfg} ],
					[ {type:'text', args:'Chart'}, {type:'widget', className:'Button', args:oChartMenuButtonCfg} ]
				]
			};
			
			// Now build a new form using the element auto-generated by widget.Dialog
			var oForm = new YAHOO.ELSA.Form(oCreatePanel.panel.form, oFormGridCfg);
			
			var oInputEl = document.createElement('input');
			oInputEl.id = sChartId;
			oInputEl.setAttribute('type', 'hidden');
			oInputEl.setAttribute('name', 'chart_id');
			oForm.form.appendChild(oInputEl);
			
			var oInputEl = document.createElement('input');
			oInputEl.id = sDashboardId;
			oInputEl.setAttribute('type', 'hidden');
			oInputEl.setAttribute('name', 'dashboard_id');
			oForm.form.appendChild(oInputEl);
		});
		oCreatePanel.panel.render();
		oCreatePanel.panel.show();
	}
}
	