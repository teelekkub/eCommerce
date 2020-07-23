const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const math = require("mathjs");
const config = require("config");

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;

const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectId;
const url = config.get("dbConnectionString");
const dbName = config.get("dbName");
const option = {
  useUnifiedTopology: true,
};

function verifyToken(req, res, next) {
  try {
    const bearerHeader = req.headers["authorization"];

    if (!bearerHeader) {
      return res.send({
        status: "error",
        detail: "invalid header.",
      });
    }

    const bearer = bearerHeader.split(" ");
    const accessToken = bearer[1];

    let privateKey = fs.readFileSync("./private.pem", "utf8");

    jwt.verify(
      accessToken,
      privateKey,
      { algorithm: "HS256" },
      (err, customer) => {
        console.log(customer);

        if (!customer.customerId) {
          return res.send({
            status: "error",
            detail: "can't get customer id.",
          });
        }

        if (customer.datetime + 86399 < Math.floor(Date.now() / 1000)) {
          return res.send({
            status: "error",
            detail: "access token is expire.",
          });
        }

        req.customer = customer;
        req.accessToken = accessToken;

        next();
      }
    );
  } catch (err) {
    return res.send({
      status: "error",
      detail: err,
    });
  }
}

function getAccessToken(customer) {
  let privateKey = fs.readFileSync("./private.pem", "utf8");

  return jwt.sign(customer, privateKey, {
    algorithm: "HS256",
  });
}

function isEmptyObject(obj) {
  return !Object.keys(obj).length;
}

app.get("/api/profile", verifyToken, (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (!req.customer.customerId) {
        return res.send({
          status: "error",
          detail: "This user cannot be found in the system..",
        });
      }

      let customerId = req.customer.customerId;

      let db = client.db(dbName);

      db.collection("customers")
        .findOne({ _id: ObjectId(customerId) }, {})
        .then((result) => {
          let data = {};

          if (result) {
            data = {
              customerId: result._id,
              name: result.name,
              gender: result.gender,
              address: result.address,
              balance: result.balance,
            };
          }

          return res.send({
            status: "success",
            data: data,
          });
        });
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.get("/api/history", verifyToken, (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (!req.customer.customerId) {
        return res.send({
          status: "error",
          detail: "This user cannot be found in the system.",
        });
      }

      let db = client.db(dbName);

      let orders = [];

      db.collection("orders")
        .aggregate([
          { $addFields: { productId: { $toObjectId: "$productId" } } },
          {
            $lookup: {
              from: "products",
              localField: "productId",
              foreignField: "_id",
              as: "product",
            },
          },
        ])
        .forEach((order) => {
          orders.push({
            datetime: order.datetime,
            amount: order.amount,
            status: order.status,
            product: {
              productId: order.product[0]._id,
              name: order.product[0].name,
              sku: order.product[0].sku,
              price: order.product[0].price,
              discount: order.product[0].discount,
            },
          });
        })
        .then(() => {
          return res.send({
            status: "success",
            data: orders,
          });
        });
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.get("/api/products", verifyToken, (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      let db = client.db(dbName);

      let products = [];

      db.collection("products")
        .find()
        .forEach((product) => {
          products.push({
            productId: product._id,
            name: product.name,
            sku: product.sku,
            amount: product.amount,
            price: product.price,
            discount: product.discount,
          });
        })
        .then(() => {
          return res.send({
            status: "success",
            data: products,
          });
        });
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.get("/api/productDetail/:productId", verifyToken, (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (!req.params.productId) {
        return res.send({
          status: "error",
          detail: "invalid input.",
        });
      }

      let productId = req.params.productId;

      let db = client.db(dbName);

      db.collection("products")
        .findOne({ _id: ObjectId(productId) }, {})
        .then((result) => {
          let data = {};

          if (result) {
            data = {
              productId: result._id,
              name: result.name,
              sku: result.sku,
              amount: result.amount,
              price: result.price,
              discount: result.discount,
            };
          }

          return res.send({
            status: "success",
            data: data,
          });
        });
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.get("/api/order/:orderId", verifyToken, (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (!req.customer.customerId) {
        return res.send({
          status: "error",
          detail: "This user cannot be found in the system..",
        });
      }

      if (!req.params.orderId) {
        return res.send({
          status: "error",
          detail: "invalid input.",
        });
      }

      let customerId = req.customer.customerId;
      let orderId = req.params.orderId;

      let db = client.db(dbName);

      let orders = [];

      db.collection("orders")
        .aggregate([
          {
            $match: {
              _id: ObjectId(orderId),
              customerId: customerId,
            },
          },
          { $addFields: { productId: { $toObjectId: "$productId" } } },
          {
            $lookup: {
              from: "products",
              localField: "productId",
              foreignField: "_id",
              as: "product",
            },
          },
        ])
        .forEach((order) => {
          orders.push({
            datetime: order.datetime,
            amount: order.amount,
            status: order.status,
            product: {
              productId: order.product[0]._id,
              name: order.product[0].name,
              sku: order.product[0].sku,
              price: order.product[0].price,
              discount: order.product[0].discount,
            },
          });
        })
        .then(() => {
          return res.send({
            status: "success",
            data: orders,
          });
        });
    });
  } catch (err) {
    res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.post("/api/register", (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (
        !req.body.name ||
        !req.body.gender ||
        !req.body.username ||
        !req.body.password ||
        !math.isNumeric(req.body.balance)
      ) {
        return res.send({
          status: "error",
          detail: "invalid input.",
        });
      }

      let db = client.db(dbName);

      db.collection("customers").insertOne(
        {
          datetime: Math.floor(Date.now() / 1000),
          name: req.body.name,
          gender: req.body.gender,
          address: req.body.address,
          balance: req.body.balance,
          username: req.body.username,
          password: req.body.password,
        },
        (err, result) => {
          if (err) throw err;

          return res.send({ status: "success", detail: "register success." });
        }
      );
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.post("/api/authen", (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (!req.body.username || !req.body.password) {
        return res.send({
          status: "error",
          detail: "invalid input.",
        });
      }

      let db = client.db(dbName);

      let username = req.body.username;
      let password = req.body.password;

      db.collection("customers")
        .findOne({ username: username, password: password }, { _id: 1 })
        .then((result) => {
          if (!result) {
            return res.send({
              status: "error",
              detail: "This user cannot be found in the system.",
            });
          }

          let accessToken = getAccessToken({
            customerId: result._id,
            datetime: Math.floor(Date.now() / 1000),
          });

          return res.send({
            status: "success",
            data: {
              access_token: accessToken,
              token_type: "bearer",
              expires_in: 86399,
            },
          });
        });
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.post("/api/order", verifyToken, (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (!req.customer.customerId) {
        return res.send({
          status: "error",
          detail: "This user cannot be found in the system.",
        });
      }

      if (!req.body.productId || !math.isNumeric(req.body.amount)) {
        return res.send({
          status: "error",
          detail: "invalid input.",
        });
      }

      let customerId = req.customer.customerId;
      let productId = req.body.productId;
      let amount = req.body.amount;

      let db = client.db(dbName);

      db.collection("products")
        .findOne({ _id: ObjectId(productId), amount: { $gt: amount } }, {})
        .then((product) => {
          if (!product) {
            return res.send({
              status: "error",
              detail:
                "This product cannot be found in the system or product out of stock.",
            });
          }

          let totalPrice = product.price * amount;

          db.collection("customers").updateOne(
            {
              _id: ObjectId(customerId),
              balance: { $gt: totalPrice },
            },
            {
              $inc: { balance: -totalPrice },
            },
            (err, result) => {
              if (err) throw err;

              if (!result.result.nModified) {
                return res.send({
                  status: "error",
                  detail: "Insufficient balance.",
                });
              }

              db.collection("orders").insertOne(
                {
                  datetime: Math.floor(Date.now() / 1000),
                  customerId: customerId,
                  productId: productId,
                  amount: amount,
                  status: "waiting_payment",
                },
                (err, result) => {
                  if (err) throw err;

                  if (!result) {
                    return res.send({
                      status: "error",
                      detail: "The system an error in operation.",
                    });
                  }

                  return res.send({
                    status: "success",
                    data: { orderId: result.insertedId },
                  });
                }
              );
            }
          );
        });
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.put("/api/cancelOrder/:orderId", verifyToken, (req, res) => {
  try {
    MongoClient.connect(url, option, (err, client) => {
      if (err) throw err;

      if (!req.customer.customerId) {
        return res.send({
          status: "error",
          detail: "This user cannot be found in the system.1",
        });
      }

      if (!req.params.orderId) {
        return res.send({
          status: "error",
          detail: "invalid input.",
        });
      }

      let customerId = req.customer.customerId;
      let orderId = req.params.orderId;

      var db = client.db(dbName);

      db.collection("orders").updateOne(
        {
          _id: ObjectId(orderId),
          customerId: customerId,
        },
        {
          $set: { status: "cancel" },
        },
        (err, result) => {
          if (err) throw err;

          if (!result) {
            return res.send({
              status: "error",
              detail: "The system an error in operation.2",
            });
          }

          return res.send({
            status: "success",
            detail: "You have canceled order number " + orderId + ".",
          });
        }
      );
    });
  } catch (err) {
    return res.send({
      status: "error",
      detail: "The system an error in operation.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port : ${PORT}`);
});

module.exports = app;
