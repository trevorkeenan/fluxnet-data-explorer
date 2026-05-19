/* # RwGet # */
RwGet = {
    pathto: function(path, file) {
        var rtrim = function(str, list) {
            var charlist = !list ? 's\xA0': (list + '').replace(/([\[\]\(\)\.\?\/\*\{\}\+\$\^\:])/g, '$1');
            var re = new RegExp('[' + charlist + ']+$', 'g');
            return (str + '').replace(re, '');
        };
        var jspathto = rtrim(RwSet.pathto, "javascript.js");
        if ((path !== undefined) && (file !== undefined)) {
            jspathto = jspathto + path + file;
        } else if (path !== undefined) {
            jspathto = jspathto + path;
        }
        return jspathto;
    },
    baseurl: function(path, file) {
        var jsbaseurl = RwSet.baseurl;
        if ((path !== undefined) && (file !== undefined)) {
            jsbaseurl = jsbaseurl + path + file;
        } else if (path !== undefined) {
            jsbaseurl = jsbaseurl + path;
        }
        return jsbaseurl;
    }
};
var mobileMenuTab = 'Navigation';
// 'qube' is the global object for the qube RapidWeaver theme
var qube = {};
// reduce potential conflicts with other scripts on the page
qube.jQuery = jQuery.noConflict(true);
var $qube = qube.jQuery;
// Create unique object and namespace for theme functions
qube.themeFunctions = {};
// Define a closure
qube.themeFunctions = (function(qubed) {
    // When jQuery is used it will be available as $ and jQuery but only
    // inside the closure.
    var jQuery = qube.jQuery;
    var $ = jQuery;
	var $qube = jQuery.noConflict();
	
	$qube(document).ready(function(){
		qube.themeFunctions.mainMenu();
		extraContent();
		pageTopHeight();
		fixedFooter();
	});
	
	/* ExtraContent r1.3 02-23-09 12:33 */
	function extraContent(){
		var i=0;
		while (i<=10) {
			$qube('#myExtraContent'+i+' script').remove();
			$qube('#myExtraContent'+i).appendTo('#extraContainer'+i);
			i++;
		}
	}
	
	qube.themeFunctions.mainMenu = function(){
		$qube('#menu').addClass('activated');
		var menuConfig = { sensitivity: 3, interval: 50, over: revealChildren, timeout: 500, out: hideChildren };
		
		function revealChildren(){ $qube(this).children("ul").css('opacity', 1).slideDown(300); }
		function hideChildren(){ $qube(this).children("ul").fadeTo(300, 0).slideUp(); }
		
		$qube("#menu ul ul").parent().addClass("ddarrow").append("<span></span>");
		$qube("#menu ul ul").css({display: "none"}); // Opera Fix
		$qube("#menu li").hoverIntent(menuConfig);
	};
	
	qube.themeFunctions.resetMainMenuColors = function() {
		if ( $qube('#mobileMenuTabWrapper').is(':visible') ) { $qube('#menuWrapper').removeClass('largeScreenNav').addClass('smallScreenNav'); }
		else { 
			if ( !$qube('#menuWrapper').is(':visible') ) { $qube('#menuWrapper').css('display','block'); }
			$qube('#menuWrapper').removeClass('smallScreenNav').addClass('largeScreenNav'); }
	};
	
	function pageTopHeight(){
		if( $qube.browser.msie && (parseInt($qube.browser.version) == '9' )){
			if (($qube("#pageTopWrapper").css("position") == "fixed")){		
				$qube("#container").css("padding-top", '49px');
			}
		} else {
			var ptHeight = $qube("#pageTopWrapper").height();
			if (($qube("#pageTopWrapper").css("position") == "fixed")){
				$qube("#container").css("padding-top", ptHeight);
			}
		}
	}
	
	function fixedFooter(){
		var footerHeight = $qube("#footerWrapper").height();
		if (($qube("#footerWrapper").css("position") == "fixed")){
			$qube("#footerSpacer").css("height", footerHeight);
		}
	}
	
	qube.themeFunctions.mobileMenu = function(){
		$qube('#mobileMenuTab').addClass('activated');
		$qube('#mobileMenuTab').click(function(){
			$qube('#menu ul ul').css('display','none');
			$qube('#menuWrapper').slideToggle('medium');
		});
	};

	/* hoverIntent r6 // 2011.02.26 // jQuery 1.5.1+ <http://cherne.net/brian/resources/jquery.hoverIntent.html> @param  f  onMouseOver function || An object with configuration options @param  g  onMouseOut function  || Nothing (use configuration options object) @author Brian Cherne brian(at)cherne(dot)net */
	(function($){$.fn.hoverIntent=function(f,g){var cfg={sensitivity:7,interval:100,timeout:0};cfg=$.extend(cfg,g?{over:f,out:g}:f);var cX,cY,pX,pY;var track=function(ev){cX=ev.pageX;cY=ev.pageY};var compare=function(ev,ob){ob.hoverIntent_t=clearTimeout(ob.hoverIntent_t);if((Math.abs(pX-cX)+Math.abs(pY-cY))<cfg.sensitivity){$(ob).unbind("mousemove",track);ob.hoverIntent_s=1;return cfg.over.apply(ob,[ev])}else{pX=cX;pY=cY;ob.hoverIntent_t=setTimeout(function(){compare(ev,ob)},cfg.interval)}};var delay=function(ev,ob){ob.hoverIntent_t=clearTimeout(ob.hoverIntent_t);ob.hoverIntent_s=0;return cfg.out.apply(ob,[ev])};var handleHover=function(e){var ev=jQuery.extend({},e);var ob=this;if(ob.hoverIntent_t){ob.hoverIntent_t=clearTimeout(ob.hoverIntent_t)}if(e.type=="mouseenter"){pX=ev.pageX;pY=ev.pageY;$(ob).bind("mousemove",track);if(ob.hoverIntent_s!=1){ob.hoverIntent_t=setTimeout(function(){compare(ev,ob)},cfg.interval)}}else{$(ob).unbind("mousemove",track);if(ob.hoverIntent_s==1){ob.hoverIntent_t=setTimeout(function(){delay(ev,ob)},cfg.timeout)}}};return this.bind('mouseenter',handleHover).bind('mouseleave',handleHover)}})(jQuery);
	
	/* Triggers a function when the window is resized, at 100ms intervals. @author Louis Remi (https://github.com/louisremi/jquery-smartresize/) */
	qube.themeFunctions.on_resize = function(c,t){onresize=function(){clearTimeout(t);t=setTimeout(c,100)};return c};
	
	return qubed;
})(qube.themeFunctions);
