/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.mortalcombatlite.Model;

/**
 *
 * @author nyaku
 */



import com.mycompany.mortalcombatlite.Heros.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;

import java.util.ArrayList;
import javax.imageio.ImageIO;
import javax.swing.ImageIcon;

public class Place {

    public int currentLocation = 1;
    public int currentEnemyNumber = 0;
    ArrayList<Enemy> currentEnemiesList = new ArrayList<>();
    Enemy[] fullEnemiesList = null;
    public int locationSize;

    public void setFullEnemiesList(Enemy[] list) {
        fullEnemiesList = list;
    }

    public ArrayList<Enemy> getEnemiesAtLocation() {
        return currentEnemiesList;
    }
    


    public void setEnemiesAtLocation(int i) throws IOException {
        
        currentEnemiesList = new ArrayList<>();
        Enemy enemy = null;
        locationSize = 1 + (int) (Math.random() * i);
        for (int j = 0; j < locationSize; j++) {
            int k = (int) (Math.random() * 4);
            switch (k) {
                case 0 -> {
                    enemy = fullEnemiesList[0];
                    enemy.setIcon("/Baraka.jpg");
                }
                case 1 -> {
                    enemy = fullEnemiesList[1];
                    enemy.setIcon("/SubZero.jpg");
                }
                case 2 -> {
                    enemy = fullEnemiesList[2];
                    enemy.setIcon("/LuKang.jpg");
                }
                case 3 -> {
                    enemy = fullEnemiesList[3];
                    enemy.setIcon("/sonya.jpg");
                }
            }
            currentEnemiesList.add(enemy);
        }
    }

    public void resetLocation(boolean a, int i) throws IOException {
        if (a) {
            currentLocation += 1 ;
            currentEnemyNumber = 0;
            setEnemiesAtLocation(i);
        }
        else {
            currentLocation = 1;
            currentEnemyNumber = 0;
            setEnemiesAtLocation(0);
        }
    }

    public int getCurrentLocation() {
        return currentLocation;
    }

    public int getCurrentEnemyNumber() {
        return currentEnemyNumber;
    }

    public Enemy getCurrentEnemy() throws IOException {
        Enemy enemy = null;
        if (currentEnemyNumber != locationSize) {
            currentEnemyNumber += 1;
            return currentEnemiesList.get(currentEnemyNumber - 1);
        } else {
            currentEnemyNumber = 0;
            enemy = fullEnemiesList[4];
            enemy.setIcon("/Boss.jpeg");
            return enemy;
        }
    }
}
