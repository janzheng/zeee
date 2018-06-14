/*

  ## todo
    - add unpaywall info and let that take precedence 
      - use unpaywall as basis for metadata


    - package data w/
      - referenceList (super hard and not worth my time for now)
        
    - run requests like: 
      - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/paperstrip?url=https://www.frontiersin.org/articles/10.3389/fmicb.2016.01024/full
      - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/paperstrip?html=true&url=https://www.frontiersin.org/articles/10.3389/fmicb.2016.01024/full
    

  ## soon
    - resolve image and other local refs
    - resolve anchor and hashtags inside the new document by rewriting them (otherwise they point nowhere or to original article)
      - necessary for research papers' citations
    - add a POST for data
      - useful for paywalled services; hooked up w/ the bookmarklet


  ## later
    - support both http and https - probably not that necessary

    ## sign in / updating code

    - NOTE NODE8 BROKEN NO JSDOM SUPPORT / WEIRD
      - SO, just update normal account for now: wt update paperstrip paperstrip8.js
      - https://webtask.io/make


            - THIS IS BROKEN
            - node8: https://tomasz.janczuk.org/2017/09/auth0-webtasks-and-node-8.html
              - wt edit -p node8 paperstrip8.js
              - wt update -p node8 paperstrip paperstrip8.js
              - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.sandbox.auth0-extend.com/readability
              - https://sandbox.auth0-extend.com/edit/wt-ece6cabd401b68e3fc2743969a9c99f0-0#token=eyJhbGciOiJIUzI1NiIsImtpZCI6IjIifQ.eyJqdGkiOiI4YzY4ZDJmMjYwMDU0NTNkYjY0NGEyMzIwY2JhMDdiZCIsImlhdCI6MTUyMjEyOTQwOCwiY2EiOlsiOTAwNzMzNGRiMDhjNGQ2M2E0MTNjZGFmM2YzYjYxNGMiXSwiZGQiOjEsInRlbiI6Ii9ed3QtZWNlNmNhYmQ0MDFiNjhlM2ZjMjc0Mzk2OWE5Yzk5ZjAtWzAtMV0kLyJ9.ymHJbNAlOM849Ue7iutsM9q54cM6yoPC0kE48ljaWg8
              - wt serve paperstrip8.js

  ## done

    - added headers for arxiv.org support
    - added gzip decompression for Massive support
    - added getMetadata 
    - add separate html ?html=true to return html, otherwise return json obj
    - added scrape for DOI and add citations 
    - add separate html ?html=true to return html, otherwise return json obj
    - all meta names changed to match unpaywall
      - unpaywall's data will overwrite my own, since their parser probably better
    - v9: converted to express server; need body parser
    - node4 deprecated on webtask; changing lang to node8
    - added some stripping code from scripts, styles, etc. which cut down react sites
    - made content stripping OPTIONAL using a content=true url param flag, for both .get and .post
    - added parsely support (for Ars) and improved code a bit, but it's still very messy/sloppy and could benefit from optimization; 'node' not used anymore b/c of $

*/


zlib = require('zlib');
_ = require('lodash');
url = require('url');
http = require('http');
https = require('https');
r = require('readability-node');
doiRegex = require('doi-regex');
const { JSDOM } = require('jsdom');

let getContent = false; // determines if we should use Readability to get the content (resource intensive)
let $; // defined later w/ source content

// https://github.com/auth0/webtask-tools
var Express = require('express');
var Webtask = require('webtask-tools');
var server = Express();

server.use(require('body-parser').json({limit: '50mb'}));
// server.use(require('body-parser').json());




var writeArticle = function( res, article ) {
  if(article) {
    res.write(
      "<html><head><meta charset='utf-8'><title>"
      + article.title
      + "</title></head><body>"
      + article.content
      + "</body></html>");
  } 
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
  try {
    
    // remove all the script tags, esp. for react sites
    // BUT this also affects sites that use parsely (e.g. Ars)
    // so only do this for enormous sites
    const SIZE_LIMIT = 600000;
    
    console.log('Source length post strip:', src.length)
    // console.log(src)
    
    if(src.length > SIZE_LIMIT) {
      // https://stackoverflow.com/questions/6659351/removing-all-script-tags-from-html-with-js-regular-expression
      var SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
      while (SCRIPT_REGEX.test(src)) {
        src = src.replace(SCRIPT_REGEX, "");
      }
      
      var STYLE_REGEX = /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;
      while (STYLE_REGEX.test(src)) {
        src = src.replace(STYLE_REGEX, "");
      }
      
      var IFRAME_REGEX = /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi;
      while (IFRAME_REGEX.test(src)) {
        src = src.replace(IFRAME_REGEX, "");
      }
    }
    
    
    var paper = {};
    console.log('getPaperFromSrc1')
    
    // let {window} = new JSDOM(src)
    // const dom = new JSDOM(`
    //   <!DOCTYPE html>
    //   <html>
    //   <head></head>
    //   <body></body>
    //   </html>
    // `);
    // console.log('temp...!', src, ' <<end')
    const dom = new JSDOM(src)
    
    const document = dom.window.document;
    const window = dom.window;
    const doc = dom.window.document // readability mutates the window document!
    $ = require('jquery')(window);
    
    // speeds things up
    if(getContent !== 'true') {
      $('body').html('')
    }
    
    console.log('getPaperFromSrc2', 
    ' -html:', $('html').html().length, 
    ' -head:', $('head').html().length, 
    ' -body:', $('body').html().length)
    
    // cut the body out for faster metadata
    const _body = $('body').html();
    $('body').html('');
    
    
    let docLight = doc;
    
    var meta = getMetadata(doc, url.parse(uri).hostname, uri)
    console.log('metadata > ', meta)
    paper = Object.assign(paper, meta)
  
    
    console.log('getPaperFromSrc3')
    
    $('body').html(_body);
    
    console.log('getPaperFromSrc3.1')
    
    if(paper.domain == 'www.researchgate.net') {
      // try to lift a doi out of researchgate
      // var doirx = 'unicorn 10.1000/xyz000 cake 10.1000/xyz001 rainbow'.match(doiRegex());
      var doirx = src.match(doiRegex());
      if(doirx && doirx.length > 0) {
        // usually returns something like "10.1007/978-1-4939-6536-6_9</li></ul></div><div" so we clear the tag crap
        var _doi = doirx[0].substring(0, doirx[0].indexOf('<'));
        // we use this lifted doi as part of the paper's doi
        // most likely this is the "real" doi
        // (don't dig into the paper though, as the intent is to bookmark the researchgate)
        if (_doi) {
          console.log('doi:',_doi)
          paper.doi = _doi
        }
      }
    }
    
    console.log('getPaperFromSrc4')
    // console.log('err > ', uri, doc)
    
    // add section identifiers (MUTATES THE DOC!)
    $('h1, h2, h3, h4, h5, h6').each(function(data){
      var ref = _.kebabCase($(this).text());
      $(this).attr('id',ref);
      $(this).addClass('paperstrip-section');
    });
    
    // console.log('getPaperFromSrc5', uri, doc)
    console.log('getPaperFromSrc5.1 Readability?', getContent)
    
    // render article after all other transformation
    // very resource-heavy, so only do it if requested
    if(getContent === 'true') {
      console.log('getPaperFromReadability!', $('body').html())
      paper['article'] = new r.Readability(uri, doc).parse();
    }
    console.log('getPaperFromSrc5.2 Readability??', paper['article'] )
    
    // console.log('getPaperFromSrc6', paper.article.content)
    console.log('getPaperFromSrc6')
    
    // add sections for parsed article
    // this is way too slow right now for super large papers 
    // probably bc i'm instantiating jquery another time; try to give a copy to readability 
    // or process this before readability 
    paper['sections'] = [];
    if(paper && paper.article) {
      // let {window} = new JSDOM(paper.article.content)
      // $ = require('jquery')(window);
    //   const _$ = require('jquery')(window);
    
      // $('h1, h2, h3, h4, h5, h6').each(function(data){
      //   console.log('sec:', $(this).text())
    //     var section = {
    //       title: $(this).text(),
    //       ref: $(this).attr('id'),
    //       tagName: $(this).prop('tagName')
    //     };
    //     paper.sections.push(section);
      // });
    }
    
    console.log('paper!!!!')
  
    // combine paper with unpaywall
  
    // console.log('Paper DOI?', paper.doi, paper )
    
    if(!paper.doi)
      return new Promise(function(resolve) {
        console.log('resolve no DOI paper')
        resolve(paper)
      }); // no doi means no unpaywall; wrap the paper in an auto resolve
  
    var unpaywall = $.get( `https://api.unpaywall.org/v2/${paper.doi}?email=admin@zeee.co`);
  
    var _paper = new Promise(function(resolve) {
      $.when(unpaywall).then(function(unpaywall) {
        // console.log('unpaywall', unpaywall);
        paper = Object.assign(paper, unpaywall);
        // console.log('Paper product', paper )
        resolve(paper);
      }, function(e){
        // add the article w/o any content on error
        console.log('Unpaywall error:', e)
        resolve(paper); 
      })
    })
    return _paper
  } catch(e) {
    console.log('getPaperFromSrc Error:', e)
  }
}



var getPaperFromUrl = function(req) {
  return new Promise((resolve, reject) => {
    
    var uri = req.query.url;
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
      
      var src='', buffer=[];
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
              paper.then(function(paper) {
                resolve(paper);
              })
            }
          });
        } else {
          console.log('source encoding:',contentEncoding, '| source length:', src.length)
          // console.log('source encoding:',contentEncoding, '| source length:', src.length, '| source data:', src , ' <<< end ')
          var paper = getPaperFromSrc(src, uri);
          paper.then(function(paper) {
            resolve(paper);
          })
        }
      });
      
    });
      
  });
};

var finish = function(res, req, paper) {
  if(req.query.html == 'true') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    writeArticle(res, paper.article);
  } else {
    writeJSON(res, paper);
  }
  console.log('finishing....', paper)
  res.end();
};


















// main entry
server.get('/', function(req, res) {

  const uri = req.query.url;
  getContent = req.query.content;
  
  // console.log('url', req.url, 'uri', uri);
  if (req.query.url) {
    console.log('Getting page from url')
    let paperFromUrl = getPaperFromUrl(req)
      .then(function(paper){
        console.log('woof woof', paper)
        if(paper.doi) {
          console.log('getting citations...');
          getCitations(paper.doi).then(function(citations) {
            paper['citations'] = citations;
            finish(res, req, paper);
          });
        } else {
          console.log('no citations......', paper)
          finish(res, req, paper);
        }
      });
      console.log('paperFromUrl', paperFromUrl)
      // res.end();
  } else {
    res.write('Please add a url= or POST with data');
    res.end();
  }
})


server.post('/', function(req, res) {
  var body = unescape(req.body.data)
  getContent = req.query.content;
  
  // console.log('server post, body:' , req.body)
  console.log('Getting page w/ posted server data', getContent)
  try {
    getPaperFromSrc(body, req.query.url).then(function(paper) {
      if(paper.doi) {
        console.log('getting citations...');
        getCitations(paper.doi).then(function(citations) {
          paper['citations'] = citations;
          finish(res, req, paper);
        });
      } else {
        console.log('no citations!!', paper)
        res.send(paper);
      }
    })
  } catch(e) {
    console.error('error getting post content', e)
    res.end()
  }
})






module.exports = Webtask.fromExpress(server);


















function getSchema(nodes, queries) {

  let result;
  
  if(queries[0] == 'pub_date') {
    console.log('getSchemaaaaa pubdate' )
  }
  
  /*
    schema.org:
      <script type="application/ld+json">
        {
          "@context": "http://schema.org",
          "@type": "NewsArticle",
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": "https://naturemicrobiologycommunity.nature.com/users/22497-eugene-koonin/posts/22565-the-most-abundant-human-associated-virus-no-longer-an-orphan"
          },
          "headline": "The most abundant human-associated virus no longer an orphan ",
          "description": "Over the last few years, microbiology in general and virology in particular have entered a new era, the age of metagenomics. ",
          "image": {
            "@type": "ImageObject",
            "url": "https://images.zapnito.com/users/22497/posters/b155f184053f10a230a10f28a634ad94/Koonin_Fig 1_large.jpg",
            "width": 900,
            "height": 802
          },
          "datePublished": "2017-11-13T17:37:00+00:00",
          "dateModified": "2017-12-16T22:45:36+00:00",
          "publisher": {
            "@type": "Organization",
            "name": "Springer Nature",
            "logo": {
              "@type": "ImageObject",
              "url": "https://themes.zapnito.com/tenants/nature-microbiology/f675e6385368158f1049f0769d31549e/assets/amp-logo.png",
              "width": 600,
              "height": 60
            }
          },
          "author": {
            "@type": "Person",
            "name": "Eugene Koonin"
          }
        }
      </script>
  */
  // find the schema object and return it, or return undefined
  var obj, src, newObj
  try {
    // $($('[type="application/ld+json"]')[0]).text()
    // I know you might have different ld+json schemas on a site, but mashing them together is just... easier
    $('[type="application/ld+json"]').each(function() {
      var newObj = JSON.parse($(this).text())

      // sometime the data is stored as separate tags (stat)... sometimes as an array within the tag (time). omfg.
      if(Array.isArray(newObj)) {
        var acc
        newObj.map((o) => {
          // acc = {...acc, ...o}
          acc = Object.assign(acc, o)
        })
        newObj = acc
      }

      // obj = {...newObj, ...obj}
      src = Object.assign(newObj, src)
    })

    // console.log('getSchema::', queries, src)
    // if (src) {
      // obj = JSON.parse(src)
      // console.log('init obj:', obj, 'full query:', queries.join())
      for (var q of queries) {
        // console.log('obj:', obj, '> q:', q, ' >>> ', obj[q])
        if(src && src[q]) { // if this exist, dig deeper {
          // console.log('objq match!')
          src = src[q]
          // need to check if it's an array; if it is we map the object contents into a new object
          if(Array.isArray(src)) {
            // console.log('isArray!!!',obj)
            var acc
            src.map((o) => {
              // acc = {...acc, ...o}
              acc = Object.assign(acc, o)
              // console.log('mapping:',o,acc)
            })
            obj = acc
            // console.log('isArray destr obj', obj)
          } else {
            obj = src
          }
        } else {
          result = undefined;
          // return undefined
        }
      }
      // return JSON.parse(src)
      // console.log('returning schema value:', obj)
      // return obj
      result = obj
    // }
    // return src
  } catch(err) {
    console.error('schema.org parser err', err) 
    // return undefined
    result = undefined;
  }


  // exit now if we've found a result
  if(result)
    return result
  
  // if schema.org doesn't exist, we check for parsely, which is all json

  /*
    parselySchema:
      <meta name="parsely-page" content="{
        "title":"Satellite images from highly oblique angles are pretty mindblowing",
        "link":"https:\/\/arstechnica.com\/science\/2018\/04\/these-oblique-satellite-images-are-pretty-amazing\/",
        "type":"post",
        "author":"Eric Berger",
        "post_id":1286291,
        "pub_date":"2018-04-02T15:21:42Z",
        "section":"Science",
        "tags":["type: report"],
        "image_url":"https:\/\/cdn.arstechnica.net\/wp-content\/uploads\/2018\/03\/doha_qatar_s3_20171111T062424Z_2050_preview-150x150.jpeg"}
      ">

      <meta name="parsely-metadata" content="{
        "type":"report",
        "title":"Satellite images from highly oblique angles are pretty mindblowing",
        "post_id":1286291,
        "lower_deck":"\u0022I thought it would be great to take some imagery of the world\u2019s most vertical places.\u0022",
        "image_url":"https:\/\/cdn.arstechnica.net\/wp-content\/uploads\/2018\/03\/doha_qatar_s3_20171111T062424Z_2050_preview-150x150.jpeg",
        "listing_image_url":"https:\/\/cdn.arstechnica.net\/wp-content\/uploads\/2018\/03\/doha_qatar_s3_20171111T062424Z_2050_preview-360x200.jpeg"}
      ">

  */
  
  if(queries[0] == 'pub_date') {
    console.log('getSchemaaaaa pubdate schemaorg > ')
  }
    

  try {
    // const src = $('[name="parsely-page"]')[0].attr('content')
    // if (src) {
    
    $('[name="parsely-page"]').each(function(t){
      const obj =  JSON.parse($(this).attr('content'))
      if(queries[0] == 'pub_date') {
        console.log('FIND PARSELY : ', $(this).attr('content'))
        console.log('Parsely: ' + obj['pub_date'], ' zz ' , queries[0])
      }
      if(obj[queries[0]]) {
        result = obj[queries[0]]
        console.log('query: ', result)
      }
    })
  } catch(err) {
    return undefined
  }

  return result
}























function metaParse(property, rules, nodes) {
  /*
    this uses jquery, and _doesn't error out_ like page-metadata-parser
    the getter uses the current node to retrieve its contents
    - the first non-null value will be returned
    rules is an array of:
      [query, getter]

      [
        ['meta[property="og:title"]', node => $(node).attr('content')],
        ['title', node => $(node).text()]
      ]

  */
  // $('title').each(function(){console.log(this)})

  var obj = {value: '(best value)', els: []}
  // console.log('Finding:', property)
  for (var rule of rules) {
    // console.log('rule:', rule[0], $(nodes))
    $(nodes).find(rule[0]).each(function() {
      // console.log('parser:', this)
      if(rule[1](this)) {
        obj.els.push({
          el: this,
          data: rule[1](this)
        })
      }
    })
  }
  // get the first one found
  if(obj.els.length > 0) {
    // for (el of els) {
    //   if(el.)
    // }
    obj.value = obj.els[0].data
    obj[property] = obj.els[0].data
  } else {
    obj.value = undefined
    obj[property] = undefined
  }
  // console.log('final:', property, obj)

  // return a complex object? (better for debugging and context parsing)
  // return obj

  // or just a string value?
  return obj.value
}









function getMetadata(doc, origin, uri) {
  // this is incredibly inefficient, but it works pretty 
  // might hang up the webtask process sometimes
  
  /*
  
    STUFF WE STILL NEED TO PARSE

      sections (esp. for papers)
        Abstract
        Introduction
        Materials and Methods
        Discussion
        Acknowledgements
        Funding Information
        Footnotes

      Publication info
        - publication date

      in each section
        - All citations within each section?
        - Name, year, click links to the DOI of that paper
        - Paragraph headers
        - Images / Figs / Tables

      DOI

      link to actual paper / pdf (checked against unpaywall)
      save to mendeley (if possible)

      all authors list
      references inside paper
      references to this paper

      Citation
      - grab it if it exists, don’t worry about generating your own

  */

  var meta = {
    abstract: metaParse("abstract", [
              [`[name="citation_abstract"]`, node => $(node).attr('content')],
            ], doc),

    abstract_url: metaParse("abstractUrl", [
              [`[name="citation_abstract_html_url"]`, node => $(node).attr('content')],
            ], doc),

    // author always returns one author
    // author: getSchema2(doc, "author") ||
    // if in case of journal, use the first author
    author: getSchema(doc, ['author','name']) || getSchema(doc, ['author']) ||
            metaParse("author", [
              [`[name="DC.Contributor"]`, node => $(node).attr('content')], // will return first one
              // [`[name="citation_authors"]`, node => $(node).attr('content')],
              [`[name="author"]`, node => $(node).attr('content')],
              [`[property="author"]`, node => $(node).attr('content')],
              [`[itemtype="http://schema.org/Person"] [itemprop="name"]`, node => $(node).text()],
              [`[itemprop="author"]`, node => $(node).attr('content')],
            ], doc),

    // build an array of authors from DC.Contributor list; useful for constructing first / last author contraction
    authorList: (() => {
                      var authorList = []
                      $(doc).find('[name="DC.Contributor"]').each(function(){authorList.push($(this).attr('content'))})
                      // only add authors from one of these, so must check length
                      if(authorList.length == 0)
                        $(doc).find('[name="citation_author"]').each(function(){authorList.push($(this).attr('content'))})
                      return authorList
                    })(),

    // only used for citations, not the author list; spits out a ton of names
    // sometimes need to join together authors into a list
    authors: metaParse("authors", [
              [`[name="citation_authors"]`, node => $(node).attr('content')],
            ], doc) || (() => {
                      var authorList = []
                      $(doc).find('[name="DC.Contributor"]').each(function(){authorList.push($(this).attr('content'))})
                      if(authorList.length == 0)
                        $(doc).find('[name="citation_author"]').each(function(){authorList.push($(this).attr('content'))})
                      return authorList.join()
                    })(),

    author_twitter: metaParse("authorTwitter", [
              [`[name="twitter:creator"]`, node => $(node).attr('content')],
            ], doc),

    // canonical url; (source url, where was it originally posted, could be somewhere else)
    canonical:  metaParse("canonical", [
              [`[rel="canonical"]`, node => $(node).attr('href')],
            ], doc),

    // article description
    // might also do what tumblr does and get the first paragraph for context,
    // especially if an article description doesn't exist; I think tumblr uses first p instead of the article desc
    description:  getSchema(doc, ['description']) ||
            metaParse("description", [
              [`[property="sailthru.description"]`, node => $(node).attr('content')],
              [`[property="twitter:description"]`, node => $(node).attr('content')],
              [`[property="og:description"]`, node => $(node).attr('content')],
              [`[name="description"]`, node => $(node).attr('content')]
            ], doc),

    doi: metaParse("DOI", [
              [`[name="citation_doi"]`, node => $(node).attr('content')],
              [`[name="DC.Identifier"]`, node => $(node).attr('content')],
            ], doc),

    // origin (not parsed, passed in)
    domain: metaParse("domain", [
              [`[name="twitter:domain"]`, node => $(node).attr('content')],
            ], doc) || origin,

    // icon
    icon:  metaParse("icon", [
              [`[rel="icon"][size="192x192"]`, node => $(node).attr('href')],
              [`[rel="shortcut icon"]`, node => $(node).attr('href')],
              [`[rel="icon"]`, node => $(node).attr('href')],
            ], doc),

    // main cover image or story image
    // image:  metaParse("image", [
    //           [`[property="twitter:image:src"]`, node => $(node).attr('content')],
    //           [`[property="og:image"]`, node => $(node).attr('content')],
    //         ], doc),
        // main cover image width
        // imageWidth:  metaParse("imageWidth", [
        //           [`[name="twitter:image:width"]`, node => $(node).attr('content')],
        //         ], doc),
        // // main cover image height
        // imageHeight:  metaParse("imageHeight", [
        //           [`[name="twitter:image:height"]`, node => $(node).attr('content')],
        //         ], doc),
    image:  getSchema(doc, ['image','url']) ||
              metaParse("image", [
                [`[property="twitter:image:src"]`, node => $(node).attr('content')],
                [`[property="og:image"]`, node => $(node).attr('content')],
              ], doc),
      imageWidth: getSchema(doc, ['image','width']) ||
                      metaParse("imageWidth", [
                        [`[property="og:image:width"]`, node => $(node).attr('content')],
                        [`[name="twitter:image:width"]`, node => $(node).attr('content')],
                      ], doc),
      imageHeight: getSchema(doc, ['image','height']) ||
                      metaParse("imageHeight", [
                        [`[property="og:image:height"]`, node => $(node).attr('content')],
                        [`[name="twitter:image:height"]`, node => $(node).attr('content')],
                      ], doc),

    // meta keyword; in a comma-delim string
    keywords: getSchema(doc, ['tags']) || getSchema(doc, ['keywords']) ||
              metaParse("keywords", [
                [`[name="citation_keywords"]`, node => $(node).attr('content')],
                [`.kwd-text`, node => $(node).text()], // kwd-text is used in the body on ncbi
                [`[name="keywords"]`, node => $(node).attr('content')], 
                [`[name="Keywords"]`, node => $(node).attr('content')], // frontiers has a weird uppercase k
              ], doc),

    modifiedTime: getSchema(doc, ['dateModified']) ||
            metaParse("modifiedTime", [
              [`[property="article:modified_time"]`, node => $(node).attr('content')],
            ], doc),

    // site/journal name (e.g. ars technica, PubMed Central (PMC))
    publication:  metaParse("publication", [
              [`[property="application-name"]`, node => $(node).attr('content')],
              [`[property="og:site_name"]`, node => $(node).attr('content')],
            ], doc),

    // published_date: metaParse("date", [
    //           [`[name="DC.date"]`, node => $(node).attr('content')],
    //           [`[name="citation_date"]`, node => $(node).attr('content')],
    //         ], doc),
    // publishedTime: getSchema(doc) ? getSchema(doc)['datePublished'] :
    published_date: getSchema(doc, ['datePublished']) || getSchema(doc, ['pub_date']) ||
            metaParse("publishedTime", [
              [`[property="article:published_time"]`, node => $(node).attr('content')],
              [`[property="article.published"]`, node => $(node).attr('content')],
              [`[name="article.published"]`, node => $(node).attr('content')],
              [`[name="pubdate"]`, node => $(node).attr('content')], // economist,
              [`[name="citation_publication_date"]`, node => $(node).attr('content')],
              [`[property="og:article:published_time"]`, node => $(node).attr('content')],
              [`[name="DC.date"]`, node => $(node).attr('content')],
              [`[name="citation_date"]`, node => $(node).attr('content')],
              [`time`, node => new Date($(node).text())], // buzzfeed; can't rely on this one <time>
            ], doc),

    // journals tend to have more of this data, and only found in the schemas
    // publisher: getSchema(doc) ? getSchema(doc).publisher.name : "",
    publisher: getSchema(doc, ['publisher','name']) ||
            metaParse("publisher", [
              [`[itemprop="publisher"]`, node => $(node).attr('content')],
              [`[name="citation_publisher"]`, node => $(node).attr('content')],
              [`[name="DC.publisher"]`, node => $(node).attr('content')],
              [`[property="article:publisher"]`, node => $(node).attr('content')],
            ], doc),
      publisherType: getSchema(doc, ['publisher','type']),
      publisherLogo: getSchema(doc, ['publisher','logo','url']),
      publisherLogoWidth: getSchema(doc, ['publisher','logo','width']),
      publisherLogoHeight: getSchema(doc, ['publisher','logo','height']),

    // meta keyword; in a comma-delim string
    section:  metaParse("section", [
              [`[property="article:setion"]`, node => $(node).attr('content')],
            ], doc),

    // mainly og, (is it an article, etc.)
    type:  metaParse("type", [
              [`[name="DC.type"]`, node => $(node).attr('content')],
              [`[property="twitter:type"]`, node => $(node).attr('content')],
              [`[property="og:type"]`, node => $(node).attr('content')],
            ], doc),


    // url of the article, prefer the meta data but can parse the url
    short_url:  metaParse("shortUrl", [
              [`[rel="shorturl"]`, node => $(node).attr('href')],
            ], doc),

    // site title
    title:  metaParse("title", [
              [`[name="citation_title"]`, node => $(node).attr('content')], // citation title take precedence
              [`[name="DC.Title"]`, node => $(node).attr('content')], // citation title take precedence
              [`[property="twitter:title"]`, node => $(node).attr('content')],
              [`[property="og:title"]`, node => $(node).attr('content')],
              [`title`, node => $(node).text()]
            ], doc),

    // parsely is another parsed meta data thing; not common, but ars uses it; returns a json string
    // parsely:  metaParse("parsely", [
    //           [`[name="parsely-page"]`, node => $(node).attr('content')],
    //         ], doc),
    //   parselyMetaData:  metaParse("parsely-metadata", [
    //             [`[name="parsely-metadata"]`, node => $(node).attr('content')],
    //           ], doc),

    // twitter handle 
    twitter:  metaParse("twitter", [
              [`[name="twitter:site"]`, node => $(node).attr('content')],
              [`[name="twitter:creator"]`, node => $(node).attr('content')],
            ], doc),

    // url of the article, prefer the meta data but can parse the url
    // the parsed url is most reliable; frontier gets ALL their social
    // urls wrong and has to redirect...
    url:  uri || metaParse("url", [
              [`[property="og:url"]`, node => $(node).attr('content')],
              [`[name="og:url"]`, node => $(node).attr('href')],
              [`[name="twitter:url"]`, node => $(node).attr('href')],
              [`[property="twitter:url"]`, node => $(node).attr('content')],
            ], doc),
            // ], doc) || window.location.search.substring(window.location.search.indexOf("url=") + 4),


    // the following are meant for citations; based on NCBI e.g https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4923195/
    journal_name: metaParse("journalTitle", [
              [`[name="citation_journal_title"]`, node => $(node).attr('content')],
            ], doc),

    journal_abbr: metaParse("journalAbbrev", [
              [`[name="citation_journal_abbrev"]`, node => $(node).attr('content')],
            ], doc),

    online_date: metaParse("onlineDate", [
              [`[name="citation_online_date"]`, node => $(node).attr('content')],
            ], doc),


    volume: metaParse("volume", [
              [`[name="citation_volume"]`, node => $(node).attr('content')],
            ], doc),

    pmid: metaParse("PMID", [
              [`[name="citation_pmid"]`, node => $(node).attr('content')],
            ], doc),

    language: getSchema(doc, ['inLanguage']) ||
                metaParse("language", [
                  [`[name="DC.Language"]`, node => $(node).attr('content')],
                  [`[name="citation_language"]`, node => $(node).attr('content')],
                ], doc),

    issn: metaParse("ISSN", [
              [`[name="citation_issn"]`, node => $(node).attr('content')],
            ], doc),

    pages: metaParse("pages", [
              [`[name="citation_pages"]`, node => $(node).attr('content')],
            ], doc),


    // files
    pdf: metaParse("PDF", [
              [`[name="citation_pdf_url"]`, node => $(node).attr('content')],
              [`[type="application/pdf"]`, node => $(node).attr('href')],
            ], doc),

    // build an array of authors from DC.Contributor list; useful for constructing first / last author contraction
    reference_list: (() => {
                      var refList = []
                      $(doc).find('[name="citation_reference"]').each(function(){refList.push($(this).attr('content'))})
                      return refList
                    })(),

  }

  // might need to replace relative urls e.g. ./assets/images/favicon.png or /
  // with [origin]/assets/images/favicon.png
  Object.keys(meta).map((i) => {
    if(meta[i] && typeof(meta[i]) == 'string') {
      // console.log('meta cleaner', i, meta[i])

      if (meta[i].substring(0,2) == './') {
        meta[i] = origin + meta[i]
      } else if (meta[i].substring(0,1) == '/') {
        meta[i] = origin + meta[i]
      }
    }
  })
  
  // make sure date is properly formatted, or null
  if(meta.published_date && isNaN(new Date(meta.published_date).getMonth()))
    meta.published_date = undefined

  // console.log('Scrobbled metadata:' , meta)
  return meta
}


/*

  Scraping Notes

  - schema.org has various ways the meta data can be stored
  - Nature uses a schema stored as
  <script type="application/ld+json">
    {
      "@context": "http://schema.org",
      "@type": "NewsArticle",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://naturemicrobiologycommunity.nature.com/users/22497-eugene-koonin/posts/22565-the-most-abundant-human-associated-virus-no-longer-an-orphan"
      },
      "headline": "The most abundant human-associated virus no longer an orphan ",
      "description": "Over the last few years, microbiology in general and virology in particular have entered a new era, the age of metagenomics. ",
        "image": {
          "@type": "ImageObject",
          "url": "https://images.zapnito.com/users/22497/posters/b155f184053f10a230a10f28a634ad94/Koonin_Fig 1_large.jpg",
          "width": 900,
          "height": 802
        },
      "datePublished": "2017-11-13T17:37:00+00:00",
      "dateModified": "2017-12-16T22:45:36+00:00",
      "publisher": {
        "@type": "Organization",
        "name": "Springer Nature",
        "logo": {
          "@type": "ImageObject",
          "url": "https://themes.zapnito.com/tenants/nature-microbiology/f675e6385368158f1049f0769d31549e/assets/amp-logo.png",
          "width": 600,
          "height": 60
        }
      },
      "author": {
        "@type": "Person",
        "name": "Eugene Koonin"
      }
    }
  </script>




*/



