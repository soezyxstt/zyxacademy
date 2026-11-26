import { productRoute } from "../../../../../routing/ProductRoute";
import { StudentProductRoute } from "../../../../../routing/StudentProductRoute";

export default productRoute("/courses/[id]/my-results/[submissionId]/summary", "student", StudentProductRoute);
