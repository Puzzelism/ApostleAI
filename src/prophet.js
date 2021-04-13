// imports
const logger = require("./logger");
const config = require("./config");
const { Wit } = require("node-wit");
const { json } = require("express");
const request = require("request");
const scripture = require("./scripture");
const porter = require("./porterStemming.js");

// init the wit client using config file
const client = new Wit({
  accessToken: config.witkey,
});

// constructor for new bots, parameters to pass socket information
function Bot(botId, importSocket, importedIO) {
  // instance handling
  if (!(this instanceof Bot)) {
    return new Bot(botId, importSocket, importedIO);
  }

  // passed arguments to bot
  this.id = botId;
  this.socket = importSocket;
  this.io = importedIO;

  // listen to message events on the socket
  importSocket.on("message", (data) => {
    // send message in response to new messages being recieved
    this.sendMessage(data);
  });

  importSocket.on("wolfram", (data) => {
    // send message in response to new messages being recieved
    this.sendWolframResponse(data, this.socket);
  });
}

Bot.prototype.sendMessage = function (msg) {
  // filter input with porterStemming
  let input = porter.textInput(msg.msg);

  // this is wrapped in a timeout to create a delay
  setTimeout(() => {
    // using the parsed porterStemming input, communicate with WitAI to get JSON response
    client
      .message(input, {})
      // on success
      .then((data) => {
        // create response object to be sent to the server
        let response = {
          sender: this.id,
          msg: this.pickReply(data, scripture.responses),
        };

        // temporary console return data with information about the bots response
        console.log(
          logger.getTime() +
            "[Bot with ID " +
            this.id +
            "]: sending message " +
            logger.info(JSON.stringify(response))
        );

        // Emit a message event on the socket to be picked up by server
        // this.socket.emit("Intent: ", data.intents[0].name);
        this.socket.emit("message", response);
      })
      // catch errors and log it to console on the error stream
      .catch(logger.error(console.error));
  }, 1000);
};

// Bots function to retrieve a reply from the scripture [lexicon]
Bot.prototype.pickReply = function (input, responses) {
  // hang some vars
  var botReply;
  var sentiment;

  // Check to see if there are intents
  if (input.intents[0] == null) {
    console.log(
      logger.getTime() +
        logger.error(
          "Note: Could not find any intent in user input! Selecting generic 'unknown' response now... "
        )
    );
    botReply =
      scripture.unknown[Math.floor(Math.random() * scripture.unknown.length)];
    return botReply;
  } else {
    if (input.traits.wit$sentiment == null) sentiment = "neutral";
    else sentiment = input.traits.wit$sentiment[0].value;

    console.log(logger.getTime() + logger.error("Sentiment: " + sentiment));
  }

  //Formualtes response based on intent and sentiment
  for (let intent in responses) {
    if (intent == input.intents[0].name) {
      botReply =
        responses[intent][sentiment][
          Math.floor(Math.random() * responses[intent][sentiment].length)
        ];
      console.log(
        logger.getTime() + logger.info("Intent: ") + input.intents[0].name
      );
      if (
        botReply == null &&
        (sentiment == "positive") | (sentiment == "negative")
      ) {
        console.log(
          logger.getTime() +
            "No " +
            sentiment +
            " sentiment response found, defaulting to neutral response"
        );
        botReply =
          responses[intent]["neutral"][
            Math.floor(Math.random() * responses[intent]["neutral"].length)
          ];
      }

      return botReply;
    }else if(input.intents[0].name == "wikiQuery"){
      // handle wikipedia callbacks
      let query = input.entities['wit$wikipedia_search_query:wikipedia_search_query'][0].body;
      // format query for wiki search
      query = query.replace(/^The\s/i, " ")
      qeury = query.split(' ').join('+')
      query = query.slice(0, -1)
      console.log(query);
      this.getWikiResponse(query, this.socket);
      return "Here's what I found on wikipedia";
    }
  }

  //Message if AI interpreted intent is not available in code
  console.log(
    logger.getTime() +
      logger.error(
        "Note: Recognized intent '" +
          input.intents[0].name +
          "' but could not find in scripture.js"
      )
  );

  botReply =
    "I understand what you're saying, but my overlords have not blessed me with the knowledge to respond...";
  return botReply;
};

Bot.prototype.sendWolframResponse = function(msg, socket){
  let query = msg.msg.substring(1);

  request('http://api.wolframalpha.com/v1/result?appid='+config.wolfid+'&i='+query, function (error, response, body) {
    if(error){
      //wolfram error handling
      console.log(logger.getTime() + logger.error(error));
    }
    let botResponse = {
      sender: this.id,
      msg: body,
    };
    console.log(logger.getTime() + "[WOLFRAM RESPONSE]: " + logger.info(body));
    socket.emit("message", botResponse);
  });
}

Bot.prototype.getWikiResponse = function(query, socket){
  request("https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&explaintext=1&titles="+query, function (error, response, body) {
    if(error){
      // wikipedia error handling
      console.log(logger.getTime() + logger.error(error));
    }
    data = JSON.parse(body);
    let botspeak = "";
    if(!data.query.pages[Object.keys(data.query.pages)[0]].extract){
      botspeak = "Nothing, my big databank is empty :c"
    }else{
      text = data.query.pages[Object.keys(data.query.pages)[0]].extract
      botspeak = text.slice(0, 256);
    }
    let botResponse = {
      sender: this.id,
      msg: "Wiki article here: " + botspeak + "...",
    };
    socket.emit("message", botResponse);
  });
}

/*
else if(input.intents[0].name == "wikiQuery"){ // handle wikipedia query using the wikiQuery intent
      console.log(input.entities['wit$wikipedia_search_query:wikipedia_search_query'][0].body);
      let query = input.entities['wit$wikipedia_search_query:wikipedia_search_query'][0].body;
      qeury.replaceAll("\\Wthe\\W|^the\\W|\\Wthe$", "");
      query = query.split(' ').join('+');
      console.log(query);
      console.log("https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&explaintext=1&titles="+query);
      request("https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&explaintext=1&titles="+query, function(error, response, body){
        if(error){
          console.log(logger.getTime() + logger.error(error));
        }
        return body["extract"];
      });
*/

module.exports = Bot;
