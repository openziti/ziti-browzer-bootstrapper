/*
Copyright Netfoundry, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var corsProxy = exports,
    url = require('url'),
    net = require('net'),
    common = require('../common'),
    httpProxy = require('http-proxy');

var regexp_tld = /\.(?:AAA|AARP|ABARTH|ABB|ABBOTT|ABBVIE|ABC|ABLE|ABOGADO|ABUDHABI|AC|ACADEMY|ACCENTURE|ACCOUNTANT|ACCOUNTANTS|ACO|ACTOR|AD|ADAC|ADS|ADULT|AE|AEG|AERO|AETNA|AF|AFAMILYCOMPANY|AFL|AFRICA|AG|AGAKHAN|AGENCY|AI|AIG|AIRBUS|AIRFORCE|AIRTEL|AKDN|AL|ALFAROMEO|ALIBABA|ALIPAY|ALLFINANZ|ALLSTATE|ALLY|ALSACE|ALSTOM|AM|AMAZON|AMERICANEXPRESS|AMERICANFAMILY|AMEX|AMFAM|AMICA|AMSTERDAM|ANALYTICS|ANDROID|ANQUAN|ANZ|AO|AOL|APARTMENTS|APP|APPLE|AQ|AQUARELLE|AR|ARAB|ARAMCO|ARCHI|ARMY|ARPA|ART|ARTE|AS|ASDA|ASIA|ASSOCIATES|AT|ATHLETA|ATTORNEY|AU|AUCTION|AUDI|AUDIBLE|AUDIO|AUSPOST|AUTHOR|AUTO|AUTOS|AVIANCA|AW|AWS|AX|AXA|AZ|AZURE|BA|BABY|BAIDU|BANAMEX|BANANAREPUBLIC|BAND|BANK|BAR|BARCELONA|BARCLAYCARD|BARCLAYS|BAREFOOT|BARGAINS|BASEBALL|BASKETBALL|BAUHAUS|BAYERN|BB|BBC|BBT|BBVA|BCG|BCN|BD|BE|BEATS|BEAUTY|BEER|BENTLEY|BERLIN|BEST|BESTBUY|BET|BF|BG|BH|BHARTI|BI|BIBLE|BID|BIKE|BING|BINGO|BIO|BIZ|BJ|BLACK|BLACKFRIDAY|BLOCKBUSTER|BLOG|BLOOMBERG|BLUE|BM|BMS|BMW|BN|BNPPARIBAS|BO|BOATS|BOEHRINGER|BOFA|BOM|BOND|BOO|BOOK|BOOKING|BOSCH|BOSTIK|BOSTON|BOT|BOUTIQUE|BOX|BR|BRADESCO|BRIDGESTONE|BROADWAY|BROKER|BROTHER|BRUSSELS|BS|BT|BUDAPEST|BUGATTI|BUILD|BUILDERS|BUSINESS|BUY|BUZZ|BV|BW|BY|BZ|BZH|CA|CAB|CAFE|CAL|CALL|CALVINKLEIN|CAM|CAMERA|CAMP|CANCERRESEARCH|CANON|CAPETOWN|CAPITAL|CAPITALONE|CAR|CARAVAN|CARDS|CARE|CAREER|CAREERS|CARS|CASA|CASE|CASH|CASINO|CAT|CATERING|CATHOLIC|CBA|CBN|CBRE|CBS|CC|CD|CENTER|CEO|CERN|CF|CFA|CFD|CG|CH|CHANEL|CHANNEL|CHARITY|CHASE|CHAT|CHEAP|CHINTAI|CHRISTMAS|CHROME|CHURCH|CI|CIPRIANI|CIRCLE|CISCO|CITADEL|CITI|CITIC|CITY|CITYEATS|CK|CL|CLAIMS|CLEANING|CLICK|CLINIC|CLINIQUE|CLOTHING|CLOUD|CLUB|CLUBMED|CM|CN|CO|COACH|CODES|COFFEE|COLLEGE|COLOGNE|COM|COMCAST|COMMBANK|COMMUNITY|COMPANY|COMPARE|COMPUTER|COMSEC|CONDOS|CONSTRUCTION|CONSULTING|CONTACT|CONTRACTORS|COOKING|COOKINGCHANNEL|COOL|COOP|CORSICA|COUNTRY|COUPON|COUPONS|COURSES|CPA|CR|CREDIT|CREDITCARD|CREDITUNION|CRICKET|CROWN|CRS|CRUISE|CRUISES|CSC|CU|CUISINELLA|CV|CW|CX|CY|CYMRU|CYOU|CZ|DABUR|DAD|DANCE|DATA|DATE|DATING|DATSUN|DAY|DCLK|DDS|DE|DEAL|DEALER|DEALS|DEGREE|DELIVERY|DELL|DELOITTE|DELTA|DEMOCRAT|DENTAL|DENTIST|DESI|DESIGN|DEV|DHL|DIAMONDS|DIET|DIGITAL|DIRECT|DIRECTORY|DISCOUNT|DISCOVER|DISH|DIY|DJ|DK|DM|DNP|DO|DOCS|DOCTOR|DOG|DOMAINS|DOT|DOWNLOAD|DRIVE|DTV|DUBAI|DUCK|DUNLOP|DUPONT|DURBAN|DVAG|DVR|DZ|EARTH|EAT|EC|ECO|EDEKA|EDU|EDUCATION|EE|EG|EMAIL|EMERCK|ENERGY|ENGINEER|ENGINEERING|ENTERPRISES|EPSON|EQUIPMENT|ER|ERICSSON|ERNI|ES|ESQ|ESTATE|ET|ETISALAT|EU|EUROVISION|EUS|EVENTS|EXCHANGE|EXPERT|EXPOSED|EXPRESS|EXTRASPACE|FAGE|FAIL|FAIRWINDS|FAITH|FAMILY|FAN|FANS|FARM|FARMERS|FASHION|FAST|FEDEX|FEEDBACK|FERRARI|FERRERO|FI|FIAT|FIDELITY|FIDO|FILM|FINAL|FINANCE|FINANCIAL|FIRE|FIRESTONE|FIRMDALE|FISH|FISHING|FIT|FITNESS|FJ|FK|FLICKR|FLIGHTS|FLIR|FLORIST|FLOWERS|FLY|FM|FO|FOO|FOOD|FOODNETWORK|FOOTBALL|FORD|FOREX|FORSALE|FORUM|FOUNDATION|FOX|FR|FREE|FRESENIUS|FRL|FROGANS|FRONTDOOR|FRONTIER|FTR|FUJITSU|FUJIXEROX|FUN|FUND|FURNITURE|FUTBOL|FYI|GA|GAL|GALLERY|GALLO|GALLUP|GAME|GAMES|GAP|GARDEN|GAY|GB|GBIZ|GD|GDN|GE|GEA|GENT|GENTING|GEORGE|GF|GG|GGEE|GH|GI|GIFT|GIFTS|GIVES|GIVING|GL|GLADE|GLASS|GLE|GLOBAL|GLOBO|GM|GMAIL|GMBH|GMO|GMX|GN|GODADDY|GOLD|GOLDPOINT|GOLF|GOO|GOODYEAR|GOOG|GOOGLE|GOP|GOT|GOV|GP|GQ|GR|GRAINGER|GRAPHICS|GRATIS|GREEN|GRIPE|GROCERY|GROUP|GS|GT|GU|GUARDIAN|GUCCI|GUGE|GUIDE|GUITARS|GURU|GW|GY|HAIR|HAMBURG|HANGOUT|HAUS|HBO|HDFC|HDFCBANK|HEALTH|HEALTHCARE|HELP|HELSINKI|HERE|HERMES|HGTV|HIPHOP|HISAMITSU|HITACHI|HIV|HK|HKT|HM|HN|HOCKEY|HOLDINGS|HOLIDAY|HOMEDEPOT|HOMEGOODS|HOMES|HOMESENSE|HONDA|HORSE|HOSPITAL|HOST|HOSTING|HOT|HOTELES|HOTELS|HOTMAIL|HOUSE|HOW|HR|HSBC|HT|HU|HUGHES|HYATT|HYUNDAI|IBM|ICBC|ICE|ICU|ID|IE|IEEE|IFM|IKANO|IL|IM|IMAMAT|IMDB|IMMO|IMMOBILIEN|IN|INC|INDUSTRIES|INFINITI|INFO|ING|INK|INSTITUTE|INSURANCE|INSURE|INT|INTERNATIONAL|INTUIT|INVESTMENTS|IO|IPIRANGA|IQ|IR|IRISH|IS|ISMAILI|IST|ISTANBUL|IT|ITAU|ITV|IVECO|JAGUAR|JAVA|JCB|JE|JEEP|JETZT|JEWELRY|JIO|JLL|JM|JMP|JNJ|JO|JOBS|JOBURG|JOT|JOY|JP|JPMORGAN|JPRS|JUEGOS|JUNIPER|KAUFEN|KDDI|KE|KERRYHOTELS|KERRYLOGISTICS|KERRYPROPERTIES|KFH|KG|KH|KI|KIA|KIM|KINDER|KINDLE|KITCHEN|KIWI|KM|KN|KOELN|KOMATSU|KOSHER|KP|KPMG|KPN|KR|KRD|KRED|KUOKGROUP|KW|KY|KYOTO|KZ|LA|LACAIXA|LAMBORGHINI|LAMER|LANCASTER|LANCIA|LAND|LANDROVER|LANXESS|LASALLE|LAT|LATINO|LATROBE|LAW|LAWYER|LB|LC|LDS|LEASE|LECLERC|LEFRAK|LEGAL|LEGO|LEXUS|LGBT|LI|LIDL|LIFE|LIFEINSURANCE|LIFESTYLE|LIGHTING|LIKE|LILLY|LIMITED|LIMO|LINCOLN|LINDE|LINK|LIPSY|LIVE|LIVING|LIXIL|LK|LLC|LLP|LOAN|LOANS|LOCKER|LOCUS|LOFT|LOL|LONDON|LOTTE|LOTTO|LOVE|LPL|LPLFINANCIAL|LR|LS|LT|LTD|LTDA|LU|LUNDBECK|LUXE|LUXURY|LV|LY|MA|MACYS|MADRID|MAIF|MAISON|MAKEUP|MAN|MANAGEMENT|MANGO|MAP|MARKET|MARKETING|MARKETS|MARRIOTT|MARSHALLS|MASERATI|MATTEL|MBA|MC|MCKINSEY|MD|ME|MED|MEDIA|MEET|MELBOURNE|MEME|MEMORIAL|MEN|MENU|MERCKMSD|MG|MH|MIAMI|MICROSOFT|MIL|MINI|MINT|MIT|MITSUBISHI|MK|ML|MLB|MLS|MM|MMA|MN|MO|MOBI|MOBILE|MODA|MOE|MOI|MOM|MONASH|MONEY|MONSTER|MORMON|MORTGAGE|MOSCOW|MOTO|MOTORCYCLES|MOV|MOVIE|MP|MQ|MR|MS|MSD|MT|MTN|MTR|MU|MUSEUM|MUTUAL|MV|MW|MX|MY|MZ|NA|NAB|NAGOYA|NAME|NATIONWIDE|NATURA|NAVY|NBA|NC|NE|NEC|NET|NETBANK|NETFLIX|NETWORK|NEUSTAR|NEW|NEWS|NEXT|NEXTDIRECT|NEXUS|NF|NFL|NG|NGO|NHK|NI|NICO|NIKE|NIKON|NINJA|NISSAN|NISSAY|NL|NO|NOKIA|NORTHWESTERNMUTUAL|NORTON|NOW|NOWRUZ|NOWTV|NP|NR|NRA|NRW|NTT|NU|NYC|NZ|OBI|OBSERVER|OFF|OFFICE|OKINAWA|OLAYAN|OLAYANGROUP|OLDNAVY|OLLO|OM|OMEGA|ONE|ONG|ONL|ONLINE|ONYOURSIDE|OOO|OPEN|ORACLE|ORANGE|ORG|ORGANIC|ORIGINS|OSAKA|OTSUKA|OTT|OVH|PA|PAGE|PANASONIC|PARIS|PARS|PARTNERS|PARTS|PARTY|PASSAGENS|PAY|PCCW|PE|PET|PF|PFIZER|PG|PH|PHARMACY|PHD|PHILIPS|PHONE|PHOTO|PHOTOGRAPHY|PHOTOS|PHYSIO|PICS|PICTET|PICTURES|PID|PIN|PING|PINK|PIONEER|PIZZA|PK|PL|PLACE|PLAY|PLAYSTATION|PLUMBING|PLUS|PM|PN|PNC|POHL|POKER|POLITIE|PORN|POST|PR|PRAMERICA|PRAXI|PRESS|PRIME|PRO|PROD|PRODUCTIONS|PROF|PROGRESSIVE|PROMO|PROPERTIES|PROPERTY|PROTECTION|PRU|PRUDENTIAL|PS|PT|PUB|PW|PWC|PY|QA|QPON|QUEBEC|QUEST|QVC|RACING|RADIO|RAID|RE|READ|REALESTATE|REALTOR|REALTY|RECIPES|RED|REDSTONE|REDUMBRELLA|REHAB|REISE|REISEN|REIT|RELIANCE|REN|RENT|RENTALS|REPAIR|REPORT|REPUBLICAN|REST|RESTAURANT|REVIEW|REVIEWS|REXROTH|RICH|RICHARDLI|RICOH|RIL|RIO|RIP|RMIT|RO|ROCHER|ROCKS|RODEO|ROGERS|ROOM|RS|RSVP|RU|RUGBY|RUHR|RUN|RW|RWE|RYUKYU|SA|SAARLAND|SAFE|SAFETY|SAKURA|SALE|SALON|SAMSCLUB|SAMSUNG|SANDVIK|SANDVIKCOROMANT|SANOFI|SAP|SARL|SAS|SAVE|SAXO|SB|SBI|SBS|SC|SCA|SCB|SCHAEFFLER|SCHMIDT|SCHOLARSHIPS|SCHOOL|SCHULE|SCHWARZ|SCIENCE|SCJOHNSON|SCOT|SD|SE|SEARCH|SEAT|SECURE|SECURITY|SEEK|SELECT|SENER|SERVICES|SES|SEVEN|SEW|SEX|SEXY|SFR|SG|SH|SHANGRILA|SHARP|SHAW|SHELL|SHIA|SHIKSHA|SHOES|SHOP|SHOPPING|SHOUJI|SHOW|SHOWTIME|SI|SILK|SINA|SINGLES|SITE|SJ|SK|SKI|SKIN|SKY|SKYPE|SL|SLING|SM|SMART|SMILE|SN|SNCF|SO|SOCCER|SOCIAL|SOFTBANK|SOFTWARE|SOHU|SOLAR|SOLUTIONS|SONG|SONY|SOY|SPA|SPACE|SPORT|SPOT|SPREADBETTING|SR|SRL|SS|ST|STADA|STAPLES|STAR|STATEBANK|STATEFARM|STC|STCGROUP|STOCKHOLM|STORAGE|STORE|STREAM|STUDIO|STUDY|STYLE|SU|SUCKS|SUPPLIES|SUPPLY|SUPPORT|SURF|SURGERY|SUZUKI|SV|SWATCH|SWIFTCOVER|SWISS|SX|SY|SYDNEY|SYSTEMS|SZ|TAB|TAIPEI|TALK|TAOBAO|TARGET|TATAMOTORS|TATAR|TATTOO|TAX|TAXI|TC|TCI|TD|TDK|TEAM|TECH|TECHNOLOGY|TEL|TEMASEK|TENNIS|TEVA|TF|TG|TH|THD|THEATER|THEATRE|TIAA|TICKETS|TIENDA|TIFFANY|TIPS|TIRES|TIROL|TJ|TJMAXX|TJX|TK|TKMAXX|TL|TM|TMALL|TN|TO|TODAY|TOKYO|TOOLS|TOP|TORAY|TOSHIBA|TOTAL|TOURS|TOWN|TOYOTA|TOYS|TR|TRADE|TRADING|TRAINING|TRAVEL|TRAVELCHANNEL|TRAVELERS|TRAVELERSINSURANCE|TRUST|TRV|TT|TUBE|TUI|TUNES|TUSHU|TV|TVS|TW|TZ|UA|UBANK|UBS|UG|UK|UNICOM|UNIVERSITY|UNO|UOL|UPS|US|UY|UZ|VA|VACATIONS|VANA|VANGUARD|VC|VE|VEGAS|VENTURES|VERISIGN|VERSICHERUNG|VET|VG|VI|VIAJES|VIDEO|VIG|VIKING|VILLAS|VIN|VIP|VIRGIN|VISA|VISION|VIVA|VIVO|VLAANDEREN|VN|VODKA|VOLKSWAGEN|VOLVO|VOTE|VOTING|VOTO|VOYAGE|VU|VUELOS|WALES|WALMART|WALTER|WANG|WANGGOU|WATCH|WATCHES|WEATHER|WEATHERCHANNEL|WEBCAM|WEBER|WEBSITE|WED|WEDDING|WEIBO|WEIR|WF|WHOSWHO|WIEN|WIKI|WILLIAMHILL|WIN|WINDOWS|WINE|WINNERS|WME|WOLTERSKLUWER|WOODSIDE|WORK|WORKS|WORLD|WOW|WS|WTC|WTF|XBOX|XEROX|XFINITY|XIHUAN|XIN|XN--11B4C3D|XN--1CK2E1B|XN--1QQW23A|XN--2SCRJ9C|XN--30RR7Y|XN--3BST00M|XN--3DS443G|XN--3E0B707E|XN--3HCRJ9C|XN--3OQ18VL8PN36A|XN--3PXU8K|XN--42C2D9A|XN--45BR5CYL|XN--45BRJ9C|XN--45Q11C|XN--4DBRK0CE|XN--4GBRIM|XN--54B7FTA0CC|XN--55QW42G|XN--55QX5D|XN--5SU34J936BGSG|XN--5TZM5G|XN--6FRZ82G|XN--6QQ986B3XL|XN--80ADXHKS|XN--80AO21A|XN--80AQECDR1A|XN--80ASEHDB|XN--80ASWG|XN--8Y0A063A|XN--90A3AC|XN--90AE|XN--90AIS|XN--9DBQ2A|XN--9ET52U|XN--9KRT00A|XN--B4W605FERD|XN--BCK1B9A5DRE4C|XN--C1AVG|XN--C2BR7G|XN--CCK2B3B|XN--CCKWCXETD|XN--CG4BKI|XN--CLCHC0EA0B2G2A9GCD|XN--CZR694B|XN--CZRS0T|XN--CZRU2D|XN--D1ACJ3B|XN--D1ALF|XN--E1A4C|XN--ECKVDTC9D|XN--EFVY88H|XN--FCT429K|XN--FHBEI|XN--FIQ228C5HS|XN--FIQ64B|XN--FIQS8S|XN--FIQZ9S|XN--FJQ720A|XN--FLW351E|XN--FPCRJ9C3D|XN--FZC2C9E2C|XN--FZYS8D69UVGM|XN--G2XX48C|XN--GCKR3F0F|XN--GECRJ9C|XN--GK3AT1E|XN--H2BREG3EVE|XN--H2BRJ9C|XN--H2BRJ9C8C|XN--HXT814E|XN--I1B6B1A6A2E|XN--IMR513N|XN--IO0A7I|XN--J1AEF|XN--J1AMH|XN--J6W193G|XN--JLQ480N2RG|XN--JLQ61U9W7B|XN--JVR189M|XN--KCRX77D1X4A|XN--KPRW13D|XN--KPRY57D|XN--KPUT3I|XN--L1ACC|XN--LGBBAT1AD8J|XN--MGB9AWBF|XN--MGBA3A3EJT|XN--MGBA3A4F16A|XN--MGBA7C0BBN0A|XN--MGBAAKC7DVF|XN--MGBAAM7A8H|XN--MGBAB2BD|XN--MGBAH1A3HJKRD|XN--MGBAI9AZGQP6J|XN--MGBAYH7GPA|XN--MGBBH1A|XN--MGBBH1A71E|XN--MGBC0A9AZCG|XN--MGBCA7DZDO|XN--MGBCPQ6GPA1A|XN--MGBERP4A5D4AR|XN--MGBGU82A|XN--MGBI4ECEXP|XN--MGBPL2FH|XN--MGBT3DHD|XN--MGBTX2B|XN--MGBX4CD0AB|XN--MIX891F|XN--MK1BU44C|XN--MXTQ1M|XN--NGBC5AZD|XN--NGBE9E0A|XN--NGBRX|XN--NODE|XN--NQV7F|XN--NQV7FS00EMA|XN--NYQY26A|XN--O3CW4H|XN--OGBPF8FL|XN--OTU796D|XN--P1ACF|XN--P1AI|XN--PGBS0DH|XN--PSSY2U|XN--Q7CE6A|XN--Q9JYB4C|XN--QCKA1PMC|XN--QXA6A|XN--QXAM|XN--RHQV96G|XN--ROVU88B|XN--RVC1E0AM3E|XN--S9BRJ9C|XN--SES554G|XN--T60B56A|XN--TCKWE|XN--TIQ49XQYJ|XN--UNUP4Y|XN--VERMGENSBERATER-CTB|XN--VERMGENSBERATUNG-PWB|XN--VHQUV|XN--VUQ861B|XN--W4R85EL8FHU5DNRA|XN--W4RS40L|XN--WGBH1C|XN--WGBL6A|XN--XHQ521B|XN--XKC2AL3HYE2A|XN--XKC2DL3A5EE0H|XN--Y9A3AQ|XN--YFRO4I67O|XN--YGBI2AMMX|XN--ZFR164B|XXX|XYZ|YACHTS|YAHOO|YAMAXUN|YANDEX|YE|YODOBASHI|YOGA|YOKOHAMA|YOU|YOUTUBE|YT|YUN|ZA|ZAPPOS|ZARA|ZERO|ZIP|ZM|ZONE|ZUERICH|ZW)$/i;

var proxy;

/**
 * @param req_url {string} The requested URL (scheme is optional).
 * @return {object} URL parsed using url.parse
 */
function parseURL(req_url, logger) {
    var match = req_url.match(/^(?:(https?:)?\/\/)?(([^\/?]+?)(?::(\d{0,5})(?=[\/?]|$))?)([\/?][\S\s]*|$)/i);
    //                              ^^^^^^^          ^^^^^^^^      ^^^^^^^                ^^^^^^^^^^^^
    //                            1:protocol        3:hostname     4:port                 5:path + query string
    //                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                                              2:host
    if (!match) {
      return null;
    }
    if (!match[1]) {
      if (/^https?:/i.test(req_url)) {
        // The pattern at top could mistakenly parse "http:///" as host="http:" and path=///.
        return null;
      }
      // Scheme is omitted.
      if (req_url.lastIndexOf('//', 0) === -1) {
        // "//" is omitted.
        req_url = '//' + req_url;
      }
      let scheme = 'https:';
      if ((match[4] !== '443') && (match[4] !== '1280')) {
        scheme = 'http:';
      }
      req_url = scheme + req_url;
    }
    var parsed = url.parse(req_url);
    if (!parsed.hostname) {
      return null;
    }
    return parsed;
}


/**
 * Check whether the specified hostname is valid.
 *
 * @param hostname {string} Host name (excluding port) of requested resource.
 * @return {boolean} Whether the requested resource can be accessed.
 */
function isValidHostName(hostname) {
    return !!(
      regexp_tld.test(hostname) ||
      net.isIPv4(hostname) ||
      net.isIPv6(hostname)
    );
}
  

/**
 * Adds CORS headers to the response headers.
 *
 * @param headers {object} Response headers
 * @param request {ServerRequest}
 */
function withCORS(headers, request) {
    headers['access-control-allow-origin'] = common.generateAccessControlAllowOrigin();
    headers['access-control-allow-credentials'] = 'true';
    var corsMaxAge = request.corsAnywhereRequestState.corsMaxAge;
    if (request.method === 'OPTIONS' && corsMaxAge) {
      headers['access-control-max-age'] = corsMaxAge;
    }
    if (request.headers['access-control-request-method']) {
      headers['access-control-allow-methods'] = request.headers['access-control-request-method'];
      delete request.headers['access-control-request-method'];
    }
    if (request.headers['access-control-request-headers']) {
      headers['access-control-allow-headers'] = request.headers['access-control-request-headers'];
      delete request.headers['access-control-request-headers'];
    }
  
    headers['access-control-expose-headers'] = Object.keys(headers).join(',');
  
    return headers;
}


/**
 * This method modifies the response headers of the proxied response.
 * If a redirect is detected, the response is not sent to the client,
 * and a new request is initiated.
 *
 * client (req) -> CORS Anywhere -> (proxyReq) -> other server
 * client (res) <- CORS Anywhere <- (proxyRes) <- other server
 *
 * @param proxy {HttpProxy}
 * @param proxyReq {ClientRequest} The outgoing request to the other server.
 * @param proxyRes {ServerResponse} The response from the other server.
 * @param req {IncomingMessage} Incoming HTTP request, augmented with property corsAnywhereRequestState
 * @param req.corsAnywhereRequestState {object}
 * @param req.corsAnywhereRequestState.location {object} See parseURL
 * @param req.corsAnywhereRequestState.getProxyForUrl {function} See proxyRequest
 * @param req.corsAnywhereRequestState.proxyBaseUrl {string} Base URL of the CORS API endpoint
 * @param req.corsAnywhereRequestState.maxRedirects {number} Maximum number of redirects
 * @param req.corsAnywhereRequestState.redirectCount_ {number} Internally used to count redirects
 * @param res {ServerResponse} Outgoing response to the client that wanted to proxy the HTTP request.
 *
 * @returns {boolean} true if http-proxy should continue to pipe proxyRes to res.
 */
 function onProxyResponse(proxy, proxyReq, proxyRes, req, res) {
    var requestState = req.corsAnywhereRequestState;
  
    var statusCode = proxyRes.statusCode;
  
    if (!requestState.redirectCount_) {
      res.setHeader('x-request-url', requestState.location.href);
    }
    // Handle redirects
    if (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) {
      var locationHeader = proxyRes.headers.location;
      var parsedLocation;
      if (locationHeader) {
        locationHeader = url.resolve(requestState.location.href, locationHeader);
        parsedLocation = parseURL(locationHeader);
      }
      if (parsedLocation) {
        if (statusCode === 301 || statusCode === 302 || statusCode === 303) {
          // Exclude 307 & 308, because they are rare, and require preserving the method + request body
          requestState.redirectCount_ = requestState.redirectCount_ + 1 || 1;
          if (requestState.redirectCount_ <= requestState.maxRedirects) {
            // Handle redirects within the server, because some clients (e.g. Android Stock Browser)
            // cancel redirects.
            // Set header for debugging purposes. Do not try to parse it!
            res.setHeader('X-CORS-Redirect-' + requestState.redirectCount_, statusCode + ' ' + locationHeader);
  
            req.method = 'GET';
            req.headers['content-length'] = '0';
            delete req.headers['content-type'];
            requestState.location = parsedLocation;
  
            // Remove all listeners (=reset events to initial state)
            req.removeAllListeners();
  
            // Remove the error listener so that the ECONNRESET "error" that
            // may occur after aborting a request does not propagate to res.
            // https://github.com/nodejitsu/node-http-proxy/blob/v1.11.1/lib/http-proxy/passes/web-incoming.js#L134
            proxyReq.removeAllListeners('error');
            proxyReq.once('error', function catchAndIgnoreError() {});
            proxyReq.abort();
  
            // Initiate a new proxy request.
            proxyRequest(req, res, proxy);
            return false;
          }
        }
        proxyRes.headers.location = requestState.proxyBaseUrl + '/' + locationHeader;
      }
    }
  
    // Strip cookies
    // delete proxyRes.headers['set-cookie'];
    // delete proxyRes.headers['set-cookie2'];
  
    proxyRes.headers['x-final-url'] = requestState.location.href;
    withCORS(proxyRes.headers, req);
    return true;
}
  

/**
 * Performs the actual proxy request.
 *
 * @param req {ServerRequest} Incoming http request
 * @param res {ServerResponse} Outgoing (proxied) http request
 * @param proxy {HttpProxy}
 */
function proxyRequest(req, res, proxy) {

    var location = req.corsAnywhereRequestState.location;
    req.url = location.path;

    var proxyOptions = {
      changeOrigin: false,
      prependPath: false,
      target: location,
      headers: {
        host: location.host,
      },
      buffer: {
        pipe: function(proxyReq) {
          var proxyReqOn = proxyReq.on;
          proxyReq.on = function(eventName, listener) {
            if (eventName !== 'response') {
              return proxyReqOn.call(this, eventName, listener);
            }
            return proxyReqOn.call(this, 'response', function(proxyRes) {
              if (onProxyResponse(proxy, proxyReq, proxyRes, req, res)) {
                try {
                  listener(proxyRes);
                } catch (err) {
                  proxyReq.emit('error', err);
                }
              }
            });
          };
          return req.pipe(proxyReq);
        },
      },
    };
    
    // Start proxying the request
    try {
      proxy.web(req, res, proxyOptions);
    } catch (err) {
      proxy.emit('error', err, req, res);
    }
}


corsProxy.createProxy = function createProxy(options) {

    if (typeof proxy === 'undefined') {

        options = options || {};
    
        // Default options:
        var httpProxyOptions = {
            xfwd: true,            // Append X-Forwarded-* headers
            secure: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
        };
        // Allow override defaults and add own options
        if (options.httpProxyOptions) {
          Object.keys(options.httpProxyOptions).forEach(function(option) {
              httpProxyOptions[option] = options.httpProxyOptions[option];
          });
        }
    
        proxy = httpProxy.createServer(httpProxyOptions);
    }

    return proxy;
}

  
corsProxy.getHandler = function getHandler(options, proxy) {

    var corsAnywhere = {
      maxRedirects: 5,                // Maximum number of redirects to be followed.
      originBlacklist: [],            // Requests from these origins will be blocked.
      originWhitelist: [],            // If non-empty, requests not from an origin in this list will be blocked.
      redirectSameOrigin: false,      // Redirect the client to the requested URL for same-origin requests.
      requireHeader: null,            // Require a header to be set?
      removeHeaders: [],              // Strip these request headers.
      setHeaders: {},                 // Set these request headers.
      corsMaxAge: 0,                  // If set, an Access-Control-Max-Age header with this value (in seconds) will be added.
      logger: null,                   // logger
    };
  
    Object.keys(corsAnywhere).forEach(function(option) {
      if (Object.prototype.hasOwnProperty.call(options, option)) {
        corsAnywhere[option] = options[option];
      }
    });
  
    // Convert corsAnywhere.requireHeader to an array of lowercase header names, or null.
    if (corsAnywhere.requireHeader) {
      if (typeof corsAnywhere.requireHeader === 'string') {
        corsAnywhere.requireHeader = [corsAnywhere.requireHeader.toLowerCase()];
      } else if (!Array.isArray(corsAnywhere.requireHeader) || corsAnywhere.requireHeader.length === 0) {
        corsAnywhere.requireHeader = null;
      } else {
        corsAnywhere.requireHeader = corsAnywhere.requireHeader.map(function(headerName) {
          return headerName.toLowerCase();
        });
      }
    }
    var hasRequiredHeaders = function(headers) {
      return !corsAnywhere.requireHeader || corsAnywhere.requireHeader.some(function(headerName) {
        return Object.hasOwnProperty.call(headers, headerName);
      });
    };
  
    return function(req, res, logger) {

      logger.debug('corsProxy handler entered for req.url [%o]', req.url);

      req.corsAnywhereRequestState = {
        maxRedirects: corsAnywhere.maxRedirects,
        corsMaxAge: corsAnywhere.corsMaxAge,
      };

      var cors_headers = withCORS({}, req);
      if (req.method === 'OPTIONS') {
        // Pre-flight request. Reply successfully:
        logger.debug('corsProxy handler method is OPTIONS');
        res.writeHead(200, cors_headers);
        res.end();
        return;
      }

      var location = parseURL(req.url.slice(17), logger);
        
      // if (!/^\/https?:/.test(req.url) && !isValidHostName(location.hostname)) {
      //   // Don't even try to proxy invalid hosts (such as /favicon.ico, /robots.txt)
      //   res.writeHead(404, 'Invalid host', cors_headers);
      //   res.end('Invalid host: ' + location.hostname);
      //   return;
      // }
  
      if (!hasRequiredHeaders(req.headers)) {
        res.writeHead(400, 'Header required', cors_headers);
        res.end('Missing required request header. Must specify one of: ' + corsAnywhere.requireHeader);
        return;
      }
  
      var origin = req.headers.origin || '';
      if (corsAnywhere.originBlacklist.indexOf(origin) >= 0) {
        res.writeHead(403, 'Forbidden', cors_headers);
        res.end('The origin "' + origin + '" was blacklisted by the operator of this proxy.');
        return;
      }
  
      if (corsAnywhere.originWhitelist.length && corsAnywhere.originWhitelist.indexOf(origin) === -1) {
        res.writeHead(403, 'Forbidden', cors_headers);
        res.end('The origin "' + origin + '" was not whitelisted by the operator of this proxy.');
        return;
      }
    
      if (corsAnywhere.redirectSameOrigin && origin && location.href[origin.length] === '/' && location.href.lastIndexOf(origin, 0) === 0) {
        // Send a permanent redirect to offload the server. Badly coded clients should not waste our resources.
        cors_headers.vary = 'origin';
        cors_headers['cache-control'] = 'private';
        cors_headers.location = location.href;
        res.writeHead(301, 'Please use a direct request', cors_headers);
        res.end();
        return;
      }

      var isRequestedOverHttps = req.connection.encrypted || /^\s*https/.test(req.headers['x-forwarded-proto']);
      var proxyBaseUrl = (isRequestedOverHttps ? 'https://' : 'http://') + req.headers.host;
  
      corsAnywhere.removeHeaders.forEach(function(header) {
        delete req.headers[header];
      });
  
      Object.keys(corsAnywhere.setHeaders).forEach(function(header) {
        req.headers[header] = corsAnywhere.setHeaders[header];
      });
  
      req.corsAnywhereRequestState.location = location;
      req.corsAnywhereRequestState.proxyBaseUrl = proxyBaseUrl;
  
      proxyRequest(req, res, proxy);
    };
}
  