import { Redirect, useLocalSearchParams, useRoute, type Href } from "expo-router";
import { productLocation } from "../routing/product-location";

export default function MuridHome() {
  const local = useLocalSearchParams();
  const route = useRoute();
  const href = productLocation("/dashboard", { ...local, ...route.params, "#": local["#"] });
  return <Redirect href={(href ?? "/dashboard") as Href} />;
}
