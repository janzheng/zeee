/*

  todo:
    - scrape for DOI and add citations 
    - support both http and https
    - resolve anchor and hashtags by rewriting them
    - resolve image and other local refs
    - add separate html ?html=true to return html, otherwise return json obj
    - add a ?data=[data]
      - useful for paywalled services; hooked up w/ the bookmarklet
    - package data w/
      - domain
      - uri
      - DOI
      - referenceList (super hard and not worth my time for now)
      - sections (e.g. methods, discussion)
        - create custom anchor links like id="discussions", "materials-and-methods"
      - citations
        - multiple styles found on google scholar auto generated
        - https://crosscite.org/format?doi=10.3389/fmicb.2016.01024&style=apa&lang=en-US
        
    - run requests like: 
      - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/paperstrip?url=https://www.frontiersin.org/articles/10.3389/fmicb.2016.01024/full
      - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/paperstrip?html=true&url=https://www.frontiersin.org/articles/10.3389/fmicb.2016.01024/full

    
    - added headers for arxiv.org support
    - added gzip decompression for Massive support
*/

zlib = require('zlib');
_ = require('lodash');
url = require('url');
http = require('http');
https = require('https');
r = require('readability-node');
jsdom = require('jsdom').jsdom;
$ = require('jquery');


var writeArticle = function( res, article ) {
  res.write(
    "<html><head><meta charset='utf-8'><title>"
    + article.title
    + "</title></head><body>"
    + article.content
    + "</body></html>"); 
};

var metaParse = function (property, rules) {
  var obj = {value: '(best value)', els: []};
  // console.log('Finding:', property)
  for (var rule of rules) {
    // console.log('rule:', rule[0])
    $(rule[0]).each(function() {
      // console.log('parser:', this)
      obj.els.push({
        el: this,
        data: rule[1](this)
      });
    });
  }
  
  // get the first one found
  if(obj.els.length > 0) {
    obj.value = obj.els[0].data;
    obj[property] = obj.els[0].data;
  } else {
    obj.value = undefined;
    obj[property] = undefined;
  }
  return obj.value;
};

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
};

var getCitations = function(doi) {
  return new Promise((resolve) => {
    // this only works for crosscite dois
    // https://crosscite.org/format?doi=10.3389/fmicb.2016.01024&style=apa&lang=en-US
    var apa = $.get( `https://crosscite.org/format?doi=${doi}&style=apa&lang=en-US`);
    var harvard = $.get( `https://crosscite.org/format?doi=${doi}&style=elsevier-harvard2&lang=en-US`);
    var mla = $.get( `https://crosscite.org/format?doi=${doi}&style=modern-language-association&lang=en-US`);
    var chicago = $.get( `https://crosscite.org/format?doi=${doi}&style=chicago-fullnote-bibliography&lang=en-US`);
    $.when(apa, harvard, mla, chicago).done(function(d1) {
      resolve({
        apa: apa,
        harvard: harvard,
        mla: mla,
        chicago: chicago
      });
    });
  });
};

getPaperFromSrc = function( src, uri ) {
  var paper = {};
  var doc = jsdom(src, {features: {
    FetchExternalResources: false,
    ProcessExternalResources: false
  }});
  $ = require('jquery')(doc.parentWindow); // initialize jquery
  
  console.log('generating paper product from', src, uri)
  
  paper['domain'] = metaParse("domain", [
            [`[name="twitter:domain"]`, node => $(node).attr('content')],
          ], doc) || url.parse(uri).host;

  paper['uri'] = uri;
          
  paper['doi'] = metaParse("DOI", [
      [`[name="citation_doi"]`, node => $(node).attr('content')],
      [`[name="DC.Identifier"]`, node => $(node).attr('content')],
    ]);
  
  
  // add section identifiers (MUTATES THE DOC!)
  $('h1, h2, h3, h4, h5, h6').each(function(data){
    var ref = _.kebabCase($(this).text());
    $(this).attr('id',ref);
  });
  
  // render article after all other transformation
  paper['article'] = new r.Readability(uri, doc).parse();
  
  console.log('BOOP',src,paper,doc)
  
  // add sections for parsed article
  paper['sections'] = [];
  $($.parseHTML(paper.article.content)).find('h1, h2, h3, h4, h5, h6').each(function(data){
    var section = {
      title: $(this).text(),
      ref: $(this).attr('id')
    };
    paper.sections.push(section);
  });
  
  console.log('paper product', doc )
  return paper; 
}
var getPaperFromUrl = function(ctx) {
  return new Promise((resolve, reject) => {
    
    var uri = ctx.query.url;
    // console.log('url', req.url, 'uri', uri);
    uri = uri ? uri : e => (res.write('add a ?url= !'));
    
    // get the article and metadata
    var options = {
      hostname: url.parse(uri).hostname,
      path: url.parse(uri).path,
      headers: {
        'user-agent': ' Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36',
      },
    }
    https.get(options, function(_res){
      
      var src, buffer=[];
      var contentEncoding = _res.headers['content-encoding'];
      _res.on('error', function(e){ reject(e) });
      _res.on('data', function(d){ 
        if(contentEncoding == 'gzip') {
          buffer.push(d)
        } else {
          src += d;
        }
      });
      _res.on('end', function(){
        
        if(contentEncoding == 'gzip') {
          console.log('zlib src',contentEncoding)
          zlib.unzip(Buffer.concat(buffer), function(err, _buffer) {
            console.log('gzip',err, _buffer)
            if (!err) {
              var paper = getPaperFromSrc(_buffer.toString(), uri);
              resolve(paper);
            }
          });
        } else {
          console.log('src',contentEncoding, src)
          var paper = getPaperFromSrc(src, uri);
          resolve(paper);
        }
      });
      
    });
      
  });
};

var finish = function(res, ctx, paper) {
  if(ctx.query.html == 'true') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    writeArticle(res, paper.article);
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    writeJSON(res, paper);
  }
  res.end();
};





// main entry
module.exports = 
  function (ctx, req, res) {
    
    if(req.method == 'GET') {
      
      var uri = ctx.query.url;
      // console.log('url', req.url, 'uri', uri);
      if (ctx.query.url) {
        if (ctx.query.data) {
          var paper = getPaperFromSrc(ctx.query.data, ctx.query.uri);
          if(paper.doi) {
              console.log('getting citations...');
            getCitations(paper.doi).then(function(citations) {
              paper['citations'] = citations;
              finish(res, ctx, paper);
            });
          }
          finish(res, ctx, paper);
        } else {
          getPaperFromUrl(ctx)
            .then(function(paper){
              if(paper.doi) {
                  console.log('getting citations...');
                getCitations(paper.doi).then(function(citations) {
                  paper['citations'] = citations;
                  finish(res, ctx, paper);
                });
              } else {
                finish(res, ctx, paper);
              }
            });
        } 
      } else {
        res.write('Please add a url= and optionally html data=');
        res.end();
      }
    }
  };
