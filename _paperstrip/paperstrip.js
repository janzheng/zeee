/*


    todo:
      - scrape for DOI and add citations 
      - support both http and https
      - resolve anchor and hashtags by rewriting them
      - resolve image and other local refs
      - add separate html endpoint
      - package data w/
        - domain
        - full uri
        - DOI
        - referenceList
        - sections (e.g. methods, discussion)
          - create custom anchor links
        - citations
          - multiple styles found on google scholar auto generated
        
*/




url = require('url');
http = require('http');
https = require('https');
r = require('readability-node');
jsdom = require('jsdom').jsdom;

// parse object to string and write the respose
var writeJSON = function( res, obj ) {
  var objJSON;
  // is an object 
  // yes: parse to a string
  // if not, set it to empty object
  if(typeof(obj) === 'object') {
    objJSON = JSON.stringify(obj);
  } else {
    objJSON = '{}';
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write( objJSON );
}

module.exports = 
  function (ctx, req, res) {
    // write the header and set the response type as a json
    res.writeHead(200, { 'Content-Type': 'text/html' });
    // res.writeHead(200, { 'Content-Type': 'application/json' });
    
    switch(req.method ){
      case 'GET':
        var uri = url.parse(req.url, true).query.url
        console.log('url', req.url, 'uri', uri)
        uri = uri ? uri : e => (res.write('add a ?url= !'));
    
        // don't forget to also add http here
        https.get(uri, function(_res){
            var src = '';
            _res.on('data', function(d){ src += d; });
            _res.on('end', function(){
              var doc = jsdom(src, {features: {
                FetchExternalResources: false,
                ProcessExternalResources: false
              }});
              var article = new r.Readability(uri, doc).parse();
              res.write(
                "<html><head><meta charset='utf-8'><title>"
                + article.title
                + "</title></head><body>"
                + article.content
                + "</body></html>");
              res.write(article)
              // writeJSON(res, {data: article});
                
              res.end();
            });
              
          });
        
        // var query = ctx.query.url;
        // if(query === undefined)  {
        //   // return everything
        //   writeJSON(res, {error: 'Please add a variable like: ?url=http://google.com'});
        //   res.end();
        // } else {
        //   request(query, function (error, response, body) {
        //     if(error) {writeJSON(res, {error: error});}
        //     console.log(response.statusCode)
        //     writeJSON(res, {
        //       statusCode: response && response.statusCode, 
        //       body: body
        //     });
        //     res.end();
        //   });
        // }
        
        
        break;
      case 'POST':
        writeJSON(res, {error: 'POST method not implemented'});
        res.end();
      break;
      case 'DELETE':
        writeJSON(res, {error: 'DELETE method not implemented'});
        res.end();
      break;
      case 'PUT':
        writeJSON(res, {error: 'PUT method not implemented'});
        res.end();
      break;
    }

  }
