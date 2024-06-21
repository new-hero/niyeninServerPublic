require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
var jwt = require("jsonwebtoken");
const SSLCommerzPayment = require("sslcommerz-lts");
const uuid = require("uuid");

const port = process.env.PORT || 5000;

const storeId = process.env.STORE_ID;
const storePassword = process.env.STORE_PASSWORD;
const isLive = false;

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dtcwl7u.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res
      .status(401)
      .send({ error: true, message: "You have Not A Token" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Your token is not valid" });
    }
    // req.decoded = decoded
    req.user = decoded;
    const sameUser = decoded.email == req.query.email;
    if (!sameUser) {
      return res
        .status(401)
        .send({ error: true, message: "You Are Not A Valid User" });
    }
    next();
  });
};

async function run() {
  try {
    client.connect();
    const database = client.db("niyenindb");
    const fakeDataCollection = database.collection("fakeData");
    const productCollection = database.collection("productCollection");
    const userCollection = database.collection("userCollection");
    const orderCollection = database.collection("orderCollection");
    // const savedOrderCollection = database.collection("savedOrderCollection");
    const paymentCollection = database.collection("paymentCollection");

    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await userCollection.findOne({ email });
      if (user.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "You are not admin" });
      }
      next();
    };

    app.get("/init", async (req, res) => {});

    app.get("/role", async (req, res) => {
      const email = req.query.email;
      const userWithRole = await userCollection.findOne({ email });
      return res.send(userWithRole);
    });
    // jwt api
    app.post("/jwt", (req, res) => {
      const token = jwt.sign(req.body, process.env.SECRET_KEY, {
        expiresIn: "3d",
      });
      return res.send({ token });
    });

    // products related api
    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const product = await fakeDataCollection.findOne(query);
      return res.send(product);
    });
    app.get("/products", async (req, res) => {
      const filterQuery = req?.query?.filter;
      const search = req?.query?.search;
      let products;
      if (filterQuery == "bestMatch") {
        products = await fakeDataCollection
          .find({ name: { $regex: search, $options: "i" } })
          .sort({ name: 1 })
          .toArray();
      } else if (filterQuery == "piceHighToLow") {
        products = await fakeDataCollection
          .find()
          .sort({ price: -1 })
          .toArray();
      } else if (filterQuery == "priceLowToHigh") {
        products = await fakeDataCollection
          .find({ name: { $regex: search, $options: "i" } })
          .sort({ price: 1 })
          .toArray();
      } else {
        products = await fakeDataCollection
          .find({ name: { $regex: search, $options: "i" } })
          .toArray();
      }
      return res.send(products);
    });
    // verify admin
    app.post("/products", verifyUser, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      return res.send(result);
    });
    // verify admin
    app.patch("/product/:id", verifyUser, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const doc = req.body;
      const result = await productCollection.updateOne(filter, doc);
      return res.send(result);
    });

    // order related api
    app.get("/orders", verifyUser, async (req, res) => {
      const query = req.user.email;
      const orders = await orderCollection.find({ email: query }).toArray();
      return res.send(orders);
    });
    app.get("/allOrder", verifyUser, verifyAdmin, async (req, res) => {
      const query = {};
      const orders = await orderCollection.find(query).toArray();
      return res.send(orders);
    });
    // verify admin
    app.post("/orders", verifyUser, async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });
    app.patch("/orders/:id", verifyUser, async (req, res) => {
      const { id } = req.params;
      const filter = { _id: new ObjectId(id) };
      const order = req.body;
      const updateDoc = {
        $set: {
          ...order,
        },
      };
      const result = await orderCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/sslPayment/:id", async (req, res) => {
      const order = req.body;
      const id = req.params.id;
      const tran_id = uuid.v4();

      const filter = { _id: new ObjectId(id) };
      await orderCollection.updateOne(filter, {
        $set: {
          ...order,
          tran_id: tran_id,
        },
      });

      const data = {
        total_amount: order.amount,
        currency: order.currency,
        tran_id: tran_id,
        success_url: `https://niyenin-server-public.vercel.app/payment/success?tran_id=${tran_id}`,
        fail_url: `https://niyenin-server-public.vercel.app/payment/fail?tran_id=${tran_id}`,
        cancel_url: `https://niyenin-server-public.vercel.app/payment/cancel?tran_id=${tran_id}`,
        ipn_url: `https://niyenin-server-public.vercel.app/payment/ipn`,
        shipping_method: "Courier",
        product_name: "Computer.",
        product_category: "Electronic",
        product_profile: "general",
        cus_name: order.name,
        cus_email: order.email,
        cus_add1: order.village,
        cus_add2: order.upoZilla,
        cus_city: order.zilla,
        cus_state: order.street,
        cus_postcode: order.postcode,
        cus_country: order.country,
        cus_phone: order.phone,
        cus_fax: "01711111",
        ship_name: order.name,
        ship_add1: order.village,
        ship_add2: order.upoZilla,
        ship_city: order.zilla,
        ship_state: order.street,
        ship_postcode: order.postcode,
        ship_country: order.country,
        multi_card_name: "mastercard",
        value_a: "ref001_A",
        value_b: "ref002_B",
        value_c: "ref003_C",
        value_d: "ref004_D",
      };

      const sslcommer = new SSLCommerzPayment(storeId, storePassword, isLive);
      let url;
      await sslcommer.init(data).then((res) => {
        url = res.GatewayPageURL;
      });
      res.send({ url });
    });

    app.post("/payment/success", async (req, res) => {
      const { tran_id } = req.query;
      const result = await orderCollection.updateOne(
        { tran_id },
        {
          $set: { paymentStatus: "paid", paidAt: new Date() },
        }
      );
      if (result.modifiedCount > 0) {
        res.redirect(
          `https://niyenin-public-app.web.app/payment/success?tran_id=${tran_id}`
        );
      }
    });

    app.post("/payment/fail", async (req, res) => {
      const { tran_id } = req.query;
      const result = await orderCollection.updateOne(
        { tran_id },
        {
          $set: {
            paymentStatus: "due",
            orderStatus: "",
            tran_id: "",
            tryToPayAt: new Date(),
          },
        }
      );
      if (result.modifiedCount > 0) {
        res.redirect(`https://niyenin-public-app.web.app/payment/fail`);
      }
    });
    app.post("/payment/cancel", async (req, res) => {
      const { tran_id } = req.query;
      const result = await orderCollection.updateOne(
        { tran_id },
        {
          $set: {
            paymentStatus: "due",
            orderStatus: "",
            tran_id: "",
            tryToPayAt: new Date(),
          },
        }
      );
      if (result.modifiedCount > 0) {
        res.redirect(`https://only-for-firebase-practice.web.app/payment/cancel`);
      }
    });
    app.get("/order/:tran_id", verifyUser, async (req, res) => {
      const tran_id = req.params.tran_id;
      const query = { tran_id };
      const order = await orderCollection.findOne(query);
      return res.send(order);
    });

    // verify admin
    app.patch("/order/:id", verifyUser, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const doc = req.body;
      const result = await orderCollection.updateOne(filter, {
        $set: {
          ...doc,
        },
      });
      return res.send(result);
    });

    // user related api
    app.get("/user/:id", verifyUser, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const user = await userCollection.findOne(query);
      return res.send(user);
    });

    app.get("/user", verifyUser, async (req, res) => {
      const query = { email: req.user.email };
      const user = await userCollection.findOne(query);
      return res.send(user);
    });

    // verify admin
    app.get("/users", verifyUser, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      return res.send(users);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = req.body.email;
      const query = { email: email };
      const exist = await userCollection.findOne(query);
      if (!exist) {
        const result = await userCollection.insertOne(user);
        return res.send(result);
      }
      return res.send({ message: "user exist in db" });
    });

    app.put("/user", verifyUser, async (req, res) => {
      const query = { email: req.user.email };
      const address = req.body;
      const options = { upsert: true };
      const doc = {
        $set: {
          address: {
            ...address,
          },
        },
      };

      const result = await userCollection.updateOne(query, doc, options);
      return res.send(result);
    });

    app.patch("/user/:id", verifyUser, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const doc = req.body;
      const result = await userCollection.updateOne(filter, {
        $set: {
          ...doc,
        },
      });
      return res.send(result);
    });

    // get all paid order
    app.get("/paidOrders", verifyUser, verifyAdmin, async (req, res) => {
      const orders = await orderCollection.find().toArray();
      const payments = orders.filter((order) => {
        order.paymentStatus == "paid";
      });
      return res.send(payments);
    });

    // add product
    app.post("/products", verifyUser, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      return res.send(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Niyenin server running ");
});

app.listen(port, () => {
  console.log(`Niyenin web-app server listening on port ${port}`);
});
