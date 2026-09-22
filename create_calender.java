import java.util.*;

//import java.math.*;
public class JavaProject {
    public static void main(String[] args){
        Scanner sc= new Scanner(System.in);
        System.out.printf("Bạn muốn sinh lịch tháng: \n");
        int n=sc.nextInt();
        
        System.out.printf("Mời nhập vào số ngày của tháng %d: \n",n);
        int day=sc.nextInt();
        System.out.printf("Ngày đầu tiên của tháng 8 là vào thứ: (Sunday = 8)\n");
        int thu=sc.nextInt();
        
        
        
        System.out.printf("%d/2026%n", n);
        System.out.println("Mon Tue Wed Thu Fri Sat Sun");

        for (int i = 1; i <= thu - 2; i++) {
        System.out.print("    ");
        }

        for (int i = 1; i <= day; i++) {
            System.out.printf("%3d ", i);

            thu++;

            if (thu == 9) {
            System.out.println();
            thu = 2;
            }
        }

        System.out.println();
    }
}
